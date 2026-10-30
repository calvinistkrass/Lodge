const g = typeof window !== 'undefined' ? window : {};

export const rtc = {
  supported: !!(g.RTCPeerConnection && g.navigator?.mediaDevices?.getUserMedia),
  screenSupported: !!g.navigator?.mediaDevices?.getDisplayMedia,
  canAnalyse: !!(g.AudioContext || g.webkitAudioContext),
  playsAudioItself: false,
  RTCPeerConnection: g.RTCPeerConnection,
  RTCSessionDescription: g.RTCSessionDescription,
  RTCIceCandidate: g.RTCIceCandidate,
  MediaStream: g.MediaStream,
  mediaDevices: g.navigator?.mediaDevices,
};
