// In Expo Go fehlt das native WebRTC-Modul – dann bleibt rtc.supported = false.
// In einem Development Build wird react-native-webrtc automatisch genutzt.
let lib = null;
try {
  lib = require('react-native-webrtc');
  if (!lib?.RTCPeerConnection || !lib?.mediaDevices) lib = null;
} catch {
  lib = null;
}

export const rtc = {
  supported: !!lib,
  screenSupported: false,
  canAnalyse: false,
  playsAudioItself: true,
  RTCPeerConnection: lib?.RTCPeerConnection,
  RTCSessionDescription: lib?.RTCSessionDescription,
  RTCIceCandidate: lib?.RTCIceCandidate,
  MediaStream: lib?.MediaStream,
  mediaDevices: lib?.mediaDevices,
  RTCView: lib?.RTCView,
};
