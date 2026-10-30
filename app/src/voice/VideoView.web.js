import React, { useEffect, useRef } from 'react';

export default function VideoView({ stream, mirror, contain, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return React.createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted: true, // Ton läuft separat über die Audio-Elemente der Engine.
    style: {
      width: '100%',
      height: '100%',
      objectFit: contain ? 'contain' : 'cover',
      transform: mirror ? 'scaleX(-1)' : undefined,
      backgroundColor: '#000',
      borderRadius: 'inherit',
      display: 'block',
      ...style,
    },
  });
}
