import React, { useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme';
import { useT } from '../i18n';
import { useStore, findUser, openModal } from '../store';
import { Avatar, Icon, IconButton, Pressy, Button, FadeIn, useIsMobile } from '../ui';
import { useVoice, voice } from '../voice/engine';
import VideoView from '../voice/VideoView';
import Header from './Header';

function Tile({ tile, focused, onPress, height }) {
  const theme = useTheme();
  const t = useT();
  const { user, kind, stream, speaking, participant, isMe } = tile;
  const showVideo = (kind === 'screen' || kind === 'camera') && stream;
  return (
    <Pressy onPress={onPress} pressScale={0.985} radius={18} style={{ flexGrow: 1, flexBasis: focused ? '100%' : 280, maxWidth: focused ? undefined : 640, height, borderRadius: 18 }}>
      <View style={{ flex: 1, height, borderRadius: 18, overflow: 'hidden', backgroundColor: theme.panel, borderWidth: 3, borderColor: speaking && kind !== 'screen' ? theme.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {showVideo ? (
          <VideoView stream={stream} mirror={isMe && kind === 'camera'} contain={kind === 'screen'} />
        ) : (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Avatar user={user} size={Math.min(96, height * 0.4)} speaking={speaking} />
          </View>
        )}
        <View style={{ position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
          {kind === 'screen' ? <Icon name="desktop-outline" size={13} color="#fff" /> : null}
          <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
            {user?.nickname || user?.displayName || '…'}
            {kind === 'screen' ? ` ${t('voice.sharing')}` : ''}
          </Text>
          {kind !== 'screen' && participant?.deafened ? <Icon name="volume-mute" size={13} color="#ff6b78" /> : kind !== 'screen' && participant?.muted ? <Icon name="mic-off" size={13} color="#ff6b78" /> : null}
        </View>
        {kind === 'screen' ? (
          <View style={{ position: 'absolute', right: 10, top: 10, backgroundColor: theme.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>LIVE</Text>
          </View>
        ) : null}
      </View>
    </Pressy>
  );
}

function ControlBar() {
  const theme = useTheme();
  const t = useT();
  const v = useVoice();
  const Btn = ({ icon, onPress, active, danger, off, label }) => (
    <IconButton icon={icon} onPress={onPress} box={52} size={22} label={label} danger={danger} filled={!danger} active={active} color={off ? theme.danger : theme.text} />
  );
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 14 }}>
      <Btn icon={v.muted ? 'mic-off' : 'mic'} off={v.muted} onPress={() => voice.toggleMute()} label={v.muted ? t('voice.unmute') : t('voice.mute')} />
      <Btn icon={v.deafened ? 'volume-mute' : 'headset'} off={v.deafened} onPress={() => voice.toggleDeafen()} label={v.deafened ? t('voice.undeafen') : t('voice.deafen')} />
      <Btn icon={v.video ? 'videocam' : 'videocam-off'} active={v.video} onPress={() => voice.toggleCamera()} label={v.video ? t('voice.cameraOff') : t('voice.camera')} />
      {voice.screenSupported ? <Btn icon="desktop-outline" active={v.screen} onPress={() => voice.toggleScreen()} label={v.screen ? t('voice.screenStop') : t('voice.screen')} /> : null}
      <Btn icon="call" danger onPress={() => voice.leave()} label={t('voice.leave')} />
    </View>
  );
}

// Kachelansicht eines Sprachraums – wird in Sprachkanälen und in DM-Anrufen genutzt.
export function VoiceStage({ roomId, compact, members }) {
  const theme = useTheme();
  const t = useT();
  const v = useVoice();
  const me = useStore((s) => s.me);
  const participants = useStore((s) => s.voiceRooms[roomId] || []);
  const { height: winH } = useWindowDimensions();
  const mobile = useIsMobile();
  const [focus, setFocus] = useState(null);
  const joined = v.roomId === roomId;
  const memberMap = Object.fromEntries((members || []).map((m) => [m.id, m]));

  const tiles = [];
  for (const p of participants) {
    const isMe = p.userId === me.id;
    const user = memberMap[p.userId] || findUser(p.userId);
    const remote = v.remote[p.userId] || {};
    const speaking = joined && v.speaking.includes(p.userId);
    if (p.screen) tiles.push({ key: `${p.socketId}-screen`, kind: 'screen', user, participant: p, isMe, stream: isMe ? v.localScreen : remote.screen });
    tiles.push({ key: `${p.socketId}-cam`, kind: p.video ? 'camera' : 'avatar', user, participant: p, isMe, speaking, stream: isMe ? v.localCamera : remote.camera });
  }

  const focused = tiles.find((x) => x.key === focus);
  const stageH = compact ? Math.min(420, winH * 0.45) : undefined;
  const tileH = compact ? Math.max(120, (stageH - 120) / Math.ceil(Math.max(1, tiles.length) / (mobile ? 1 : 3))) : mobile ? 200 : 240;

  return (
    <View style={{ backgroundColor: compact ? theme.rail : theme.bg, height: stageH, flex: compact ? undefined : 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 14, gap: 12, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center' }}>
        {!tiles.length ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
            <Icon name="volume-high" size={40} color={theme.textFaint} />
            <Text style={{ color: theme.textMuted, textAlign: 'center', maxWidth: 320 }}>{t('voice.noOne')}</Text>
          </View>
        ) : focused ? (
          <Tile tile={focused} focused height={compact ? stageH - 110 : Math.max(300, winH - 220)} onPress={() => setFocus(null)} />
        ) : (
          tiles.map((tile) => <Tile key={tile.key} tile={tile} height={tileH} onPress={() => setFocus(tile.key)} />)
        )}
      </ScrollView>
      {joined ? (
        <ControlBar />
      ) : (
        <View style={{ alignItems: 'center', padding: 14 }}>
          <Button icon="call" title={compact ? t('voice.join') : t('voice.joinVoice')} variant="success" onPress={() => voice.join(roomId)} />
        </View>
      )}
      {!voice.supported ? (
        <FadeIn style={{ margin: 12, marginTop: 0, padding: 12, borderRadius: 12, backgroundColor: theme.danger + '22', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="information-circle" size={18} color={theme.danger} />
          <Text style={{ color: theme.text, flex: 1, fontSize: theme.fs(13) }}>{t('voice.unsupported')}</Text>
        </FadeIn>
      ) : null}
    </View>
  );
}

export default function VoiceView({ roomId, title, server, onBack }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={{ flex: 1 }}>
      <Header icon="volume-high-outline" title={title} subtitle={server?.name} onBack={onBack} right={<IconButton icon="person-add-outline" onPress={() => openModal('invite', { server })} label={t('server.invite')} />} />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <VoiceStage roomId={roomId} members={server?.members} />
      </View>
    </View>
  );
}
