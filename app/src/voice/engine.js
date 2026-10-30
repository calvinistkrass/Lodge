import { useSyncExternalStore } from 'react';
import { rtc } from './rtc';
import { getState, setState, showToast, updateSettings } from '../store';
import { playSound, startLoop, stopLoop } from '../sounds';
import { translate, resolveLanguage } from '../i18n';

// Kostenlose öffentliche STUN-Server. Für sehr strikte Netzwerke kann ein TURN-Server
// in den Einstellungen ergänzt werden.
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];

// Feste Reihenfolge der Transceiver: so lassen sich Kamera und Bildschirm per replaceTrack
// an- und abschalten, ohne die Verbindung neu aushandeln zu müssen.
const SLOTS = ['audio', 'camera', 'screen', 'screenAudio'];
const SLOT_KIND = { audio: 'audio', camera: 'video', screen: 'video', screenAudio: 'audio' };

const t = (key, vars) => translate(resolveLanguage(getState().settings.language), key, vars);

class VoiceEngine {
  roomId = null;
  status = 'idle';
  muted = false;
  deafened = false;
  mutedBeforeDeafen = false;
  micTrack = null;
  cameraTrack = null;
  cameraStream = null;
  screenTrack = null;
  screenAudioTrack = null;
  screenStream = null;
  peers = new Map();
  speaking = new Set();
  listeners = new Set();
  socket = null;
  snapshot = null;
  audioCtx = null;
  analysers = new Map(); // key -> { analyser, source }
  analyseTimer = null;

  get supported() {
    return rtc.supported;
  }

  get screenSupported() {
    return rtc.screenSupported;
  }

  // ---------- Abonnement für die Oberfläche ----------

  subscribe = (l) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  emit() {
    this.snapshot = null;
    for (const l of this.listeners) l();
  }

  getSnapshot = () => {
    if (!this.snapshot) {
      const remote = {};
      for (const p of this.peers.values()) remote[p.userId] = { camera: p.streams.camera || null, screen: p.streams.screen || null, connection: p.pc.connectionState };
      this.snapshot = {
        roomId: this.roomId,
        status: this.status,
        muted: this.muted,
        deafened: this.deafened,
        video: !!this.cameraTrack,
        screen: !!this.screenTrack,
        localCamera: this.cameraStream,
        localScreen: this.screenStream,
        remote,
        speaking: [...this.speaking],
      };
    }
    return this.snapshot;
  };

  // ---------- Socket ----------

  attachSocket(socket) {
    this.socket = socket;
    socket.on('voice:signal', (msg) => this.handleSignal(msg).catch((e) => console.warn('signal', e)));
    socket.on('voice:peer-left', ({ socketId }) => {
      this.closePeer(socketId);
      playSound('leave');
      this.emit();
    });
    socket.on('voice:peer-joined', () => {
      stopLoop('ringback');
      playSound('join');
    });
    socket.on('call:declined', ({ dmId, userId }) => {
      if (dmId !== this.roomId || userId === getState().me?.id) return;
      // Nur hörbar, solange man noch allein im Anruf wartet.
      if (this.peers.size) return;
      stopLoop('ringback');
      playSound('declined');
      showToast(t('voice.callDeclined'), 'info');
    });
    socket.on('disconnect', () => {
      if (!this.roomId) return;
      for (const id of [...this.peers.keys()]) this.closePeer(id);
      this.status = 'connecting';
      this.emit();
    });
    socket.on('connect', () => {
      if (this.roomId) this.enterRoom(this.roomId);
    });
  }

  signal(to, data) {
    this.socket?.emit('voice:signal', { to, data });
  }

  sendState() {
    this.socket?.emit('voice:state', { muted: this.muted, deafened: this.deafened, video: !!this.cameraTrack, screen: !!this.screenTrack });
  }

  // ---------- Beitreten / Verlassen ----------

  audioConstraints() {
    const s = getState().settings;
    return {
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
      ...(s.inputDeviceId && s.inputDeviceId !== 'default' ? { deviceId: { exact: s.inputDeviceId } } : {}),
    };
  }

  async acquireMic() {
    try {
      const stream = await rtc.mediaDevices.getUserMedia({ audio: this.audioConstraints(), video: false });
      this.micTrack?.stop();
      this.micTrack = stream.getAudioTracks()[0] || null;
      if (this.micTrack) this.micTrack.enabled = !this.muted && !this.deafened;
      this.replaceSlot('audio', this.micTrack);
      this.watchLevel('me', stream);
      return true;
    } catch (e) {
      console.warn('mic', e);
      return false;
    }
  }

  async join(roomId) {
    if (!rtc.supported) return showToast(t('voice.unsupported'), 'error');
    if (this.roomId === roomId) return;
    if (this.roomId) this.leave(true);
    this.roomId = roomId;
    this.status = 'connecting';
    this.deafened = false;
    this.muted = !!getState().settings.joinMuted;
    this.emit();
    const ok = await this.acquireMic();
    if (!ok) {
      this.muted = true;
      showToast(t('voice.micDenied'), 'error');
    }
    if (this.roomId !== roomId) return; // in der Zwischenzeit verlassen
    this.enterRoom(roomId);
    this.startAnalysis();
  }

  enterRoom(roomId) {
    this.socket?.emit('voice:join', { roomId, state: { muted: this.muted, deafened: this.deafened } }, (res) => {
      if (this.roomId !== roomId) return;
      if (!res?.ok) {
        showToast(t(`errors.${res?.error}`), 'error');
        return this.leave(true);
      }
      this.status = 'connected';
      playSound('join');
      // Allein in einem DM-Anruf: Freizeichen, bis jemand rangeht.
      const isDm = getState().dms.some((d) => d.id === roomId);
      if (isDm && !res.peers.length) setTimeout(() => this.roomId === roomId && !this.peers.size && startLoop('ringback', 3000, 30000), 400);
      for (const p of res.peers) this.startOffer(p.socketId, p.userId);
      if (this.cameraTrack || this.screenTrack) this.sendState();
      this.emit();
    });
  }

  leave(silent) {
    if (!this.roomId) return;
    stopLoop('ringback');
    this.socket?.emit('voice:leave');
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    for (const tr of [this.micTrack, this.cameraTrack, this.screenTrack, this.screenAudioTrack]) tr?.stop();
    this.micTrack = this.cameraTrack = this.screenTrack = this.screenAudioTrack = null;
    this.cameraStream = this.screenStream = null;
    this.stopAnalysis();
    this.roomId = null;
    this.status = 'idle';
    this.speaking.clear();
    if (!silent) playSound('leave');
    this.emit();
  }

  // ---------- Peer-Verbindungen ----------

  createPeer(socketId, userId) {
    const pc = new rtc.RTCPeerConnection({ iceServers: this.iceServers() });
    const peer = { socketId, userId, pc, pending: [], streams: {}, audioEls: {} };
    this.peers.set(socketId, peer);
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) this.signal(socketId, { candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    });
    pc.addEventListener('track', (e) => this.handleTrack(peer, e));
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') pc.restartIce?.();
      this.emit();
    });
    return peer;
  }

  iceServers() {
    const turn = getState().settings.turn;
    return turn?.urls ? [...STUN, turn] : STUN;
  }

  async startOffer(socketId, userId) {
    const peer = this.createPeer(socketId, userId);
    for (const slot of SLOTS) peer.pc.addTransceiver(SLOT_KIND[slot], { direction: 'sendrecv' });
    await this.attachLocal(peer);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.signal(socketId, { sdp: { type: peer.pc.localDescription.type, sdp: peer.pc.localDescription.sdp } });
  }

  localTrack(slot) {
    return { audio: this.micTrack, camera: this.cameraTrack, screen: this.screenTrack, screenAudio: this.screenAudioTrack }[slot] || null;
  }

  async attachLocal(peer) {
    const trs = peer.pc.getTransceivers();
    await Promise.all(SLOTS.map((slot, i) => trs[i]?.sender.replaceTrack(this.localTrack(slot)).catch(() => {})));
  }

  replaceSlot(slot, track) {
    const i = SLOTS.indexOf(slot);
    for (const p of this.peers.values()) p.pc.getTransceivers()[i]?.sender.replaceTrack(track).catch(() => {});
  }

  async handleSignal({ from, userId, data }) {
    if (!this.roomId) return;
    let peer = this.peers.get(from);
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        if (peer) this.closePeer(from);
        peer = this.createPeer(from, userId);
        await peer.pc.setRemoteDescription(new rtc.RTCSessionDescription(data.sdp));
        for (const tr of peer.pc.getTransceivers()) tr.direction = 'sendrecv';
        await this.attachLocal(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.signal(from, { sdp: { type: peer.pc.localDescription.type, sdp: peer.pc.localDescription.sdp } });
      } else if (peer) {
        await peer.pc.setRemoteDescription(new rtc.RTCSessionDescription(data.sdp));
      }
      if (peer) {
        for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(new rtc.RTCIceCandidate(c)).catch(() => {});
      }
    } else if (data.candidate && peer) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(new rtc.RTCIceCandidate(data.candidate)).catch(() => {});
      else peer.pending.push(data.candidate);
    }
    this.emit();
  }

  handleTrack(peer, e) {
    const trs = peer.pc.getTransceivers();
    let idx = e.transceiver ? trs.indexOf(e.transceiver) : -1;
    if (idx === -1) idx = trs.findIndex((tr) => tr.receiver?.track?.id === e.track.id);
    const slot = SLOTS[idx];
    if (!slot) return;
    let stream;
    try {
      stream = new rtc.MediaStream([e.track]);
    } catch {
      stream = e.streams?.[0];
    }
    peer.streams[slot] = stream;
    if (SLOT_KIND[slot] === 'audio') {
      if (!rtc.playsAudioItself && typeof Audio !== 'undefined') {
        const el = new Audio();
        el.autoplay = true;
        el.srcObject = stream;
        this.applyAudioEl(el, peer.userId);
        el.play().catch(() => {});
        peer.audioEls[slot] = el;
      } else {
        e.track.enabled = !this.deafened;
      }
      if (slot === 'audio') this.watchLevel(peer.socketId, stream, peer.userId);
    }
    this.emit();
  }

  applyAudioEl(el, userId) {
    const s = getState().settings;
    el.muted = this.deafened;
    el.volume = Math.max(0, Math.min(1, s.userVolumes?.[userId] ?? 1));
    if (s.outputDeviceId && s.outputDeviceId !== 'default' && el.setSinkId) el.setSinkId(s.outputDeviceId).catch(() => {});
  }

  closePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    try {
      peer.pc.close();
    } catch {}
    for (const el of Object.values(peer.audioEls)) {
      el.pause();
      el.srcObject = null;
    }
    this.unwatchLevel(socketId);
    this.speaking.delete(peer.userId);
    this.peers.delete(socketId);
  }

  // ---------- Steuerung ----------

  async toggleMute() {
    if (!this.roomId) return;
    if (this.deafened) {
      this.deafened = false;
      this.muted = false;
      this.applyDeafen();
    } else this.muted = !this.muted;
    if (!this.muted && !this.micTrack) {
      if (!(await this.acquireMic())) {
        this.muted = true;
        showToast(t('voice.micDenied'), 'error');
      }
    }
    if (this.micTrack) this.micTrack.enabled = !this.muted;
    playSound(this.muted ? 'mute' : 'unmute');
    this.sendState();
    this.emit();
  }

  toggleDeafen() {
    if (!this.roomId) return;
    this.deafened = !this.deafened;
    if (this.deafened) {
      this.mutedBeforeDeafen = this.muted;
      this.muted = true;
    } else this.muted = this.mutedBeforeDeafen;
    if (this.micTrack) this.micTrack.enabled = !this.muted;
    this.applyDeafen();
    playSound(this.deafened ? 'deafen' : 'undeafen');
    this.sendState();
    this.emit();
  }

  applyDeafen() {
    for (const p of this.peers.values()) {
      for (const el of Object.values(p.audioEls)) el.muted = this.deafened;
      if (rtc.playsAudioItself) for (const slot of ['audio', 'screenAudio']) p.streams[slot]?.getAudioTracks().forEach((tr) => (tr.enabled = !this.deafened));
    }
  }

  async toggleCamera() {
    if (!this.roomId) return;
    if (this.cameraTrack) {
      this.cameraTrack.stop();
      this.cameraTrack = null;
      this.cameraStream = null;
      this.replaceSlot('camera', null);
      playSound('cameraOff');
    } else {
      try {
        const stream = await rtc.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
        this.cameraTrack = stream.getVideoTracks()[0];
        this.cameraStream = stream;
        this.replaceSlot('camera', this.cameraTrack);
        playSound('cameraOn');
      } catch (e) {
        console.warn('camera', e);
        showToast(t('voice.cameraDenied'), 'error');
      }
    }
    this.sendState();
    this.emit();
  }

  async toggleScreen() {
    if (!this.roomId) return;
    if (this.screenTrack) return this.stopScreen();
    if (!rtc.screenSupported) return showToast(t('voice.screenUnsupported'), 'error');
    try {
      const stream = await rtc.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: true });
      this.screenStream = stream;
      this.screenTrack = stream.getVideoTracks()[0];
      this.screenAudioTrack = stream.getAudioTracks()[0] || null;
      if ('contentHint' in this.screenTrack) this.screenTrack.contentHint = 'detail';
      this.screenTrack.addEventListener('ended', () => this.stopScreen());
      this.replaceSlot('screen', this.screenTrack);
      this.replaceSlot('screenAudio', this.screenAudioTrack);
      playSound('screenOn');
      this.sendState();
      this.emit();
    } catch (e) {
      console.warn('screen', e);
    }
  }

  stopScreen() {
    if (!this.screenTrack) return;
    this.screenTrack.stop();
    this.screenAudioTrack?.stop();
    this.screenTrack = this.screenAudioTrack = this.screenStream = null;
    this.replaceSlot('screen', null);
    this.replaceSlot('screenAudio', null);
    playSound('screenOff');
    this.sendState();
    this.emit();
  }

  setUserVolume(userId, volume) {
    const s = getState().settings;
    updateSettings({ userVolumes: { ...s.userVolumes, [userId]: volume } });
    for (const p of this.peers.values()) if (p.userId === userId) for (const el of Object.values(p.audioEls)) el.volume = Math.max(0, Math.min(1, volume));
  }

  // Nach Änderung von Geräten/Filtern in den Einstellungen.
  async refreshDevices() {
    for (const p of this.peers.values()) for (const el of Object.values(p.audioEls)) this.applyAudioEl(el, p.userId);
    if (this.roomId && this.micTrack) await this.acquireMic();
  }

  // ---------- Sprecherkennung ----------

  ensureCtx() {
    if (!rtc.canAnalyse) return null;
    this.audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
    return this.audioCtx;
  }

  watchLevel(key, stream, userId) {
    const ctx = this.ensureCtx();
    if (!ctx || !stream) return;
    this.unwatchLevel(key);
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      this.analysers.set(key, { analyser, source, userId: userId || getState().me?.id, buf: new Uint8Array(analyser.fftSize), hold: 0 });
    } catch {}
  }

  unwatchLevel(key) {
    const a = this.analysers.get(key);
    if (!a) return;
    try {
      a.source.disconnect();
    } catch {}
    this.analysers.delete(key);
  }

  startAnalysis() {
    if (this.analyseTimer || !rtc.canAnalyse) return;
    this.analyseTimer = setInterval(() => {
      let changed = false;
      for (const [key, a] of this.analysers) {
        a.analyser.getByteTimeDomainData(a.buf);
        let sum = 0;
        for (let i = 0; i < a.buf.length; i++) {
          const v = (a.buf[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.sqrt(sum / a.buf.length);
        const silencedLocally = key === 'me' && this.muted;
        if (level > 0.025 && !silencedLocally) a.hold = 3;
        else if (a.hold > 0) a.hold--;
        const speaking = a.hold > 0;
        if (speaking !== this.speaking.has(a.userId)) {
          speaking ? this.speaking.add(a.userId) : this.speaking.delete(a.userId);
          changed = true;
        }
      }
      if (changed) this.emit();
    }, 100);
  }

  stopAnalysis() {
    clearInterval(this.analyseTimer);
    this.analyseTimer = null;
    for (const key of [...this.analysers.keys()]) this.unwatchLevel(key);
  }

  // Mikrofontest für die Einstellungen: liefert laufend einen Pegel zwischen 0 und 1.
  async micTest(onLevel) {
    if (!rtc.supported) return () => {};
    const stream = await rtc.mediaDevices.getUserMedia({ audio: this.audioConstraints() });
    const ctx = this.ensureCtx();
    if (!ctx) {
      stream.getTracks().forEach((tr) => tr.stop());
      return () => {};
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    // Eigene Stimme hörbar machen (wie bei Discord).
    source.connect(ctx.destination);
    const buf = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += ((buf[i] - 128) / 128) ** 2;
      onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
    }, 60);
    return () => {
      clearInterval(timer);
      try {
        source.disconnect();
      } catch {}
      stream.getTracks().forEach((tr) => tr.stop());
    };
  }

  async listDevices() {
    if (!rtc.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    try {
      const devices = await rtc.mediaDevices.enumerateDevices();
      return {
        inputs: devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'),
        outputs: devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications'),
      };
    } catch {
      return { inputs: [], outputs: [] };
    }
  }
}

export const voice = new VoiceEngine();
if (__DEV__ && typeof window !== 'undefined') window.__lodgeVoice = voice;

export function useVoice() {
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getSnapshot);
}

// Dekoriert den Teilnehmer aus dem Server-Zustand mit lokalen Streams.
export function voiceRoomOf(roomId) {
  return getState().voiceRooms[roomId] || [];
}

export { setState };
