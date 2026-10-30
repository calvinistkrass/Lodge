import React from 'react';
import { View } from 'react-native';
import { rtc } from './rtc';

export default function VideoView({ stream, mirror, contain, style }) {
  if (!rtc.RTCView || !stream) return <View style={[{ flex: 1, backgroundColor: '#000' }, style]} />;
  const RTCView = rtc.RTCView;
  return <RTCView streamURL={stream.toURL()} mirror={mirror} objectFit={contain ? 'contain' : 'cover'} style={[{ flex: 1, backgroundColor: '#000' }, style]} />;
}
