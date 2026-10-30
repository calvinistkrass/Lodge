import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Animated, Platform, StyleSheet, BackHandler, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, onColor } from '../theme';
import { useT } from '../i18n';
import { useStore, navigate, openModal, closeModal, getState, dmTitle } from '../store';
import { Pressy, Icon, IconButton, Avatar, useIsMobile, FadeIn, EmptyState } from '../ui';
import { useVoice, voice } from '../voice/engine';
import ChatView from './ChatView';
import FriendsView from './FriendsView';
import VoiceView from './VoiceView';
import { MemberList } from './MemberList';
import { useCanDownloadDesktop, downloadDesktop } from '../util';

// ---------- Server-Leiste ----------

function RailItem({ active, onPress, color, icon, label, badge, children, accent }) {
  const theme = useTheme();
  const shape = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pill = useRef(new Animated.Value(active ? 1 : 0)).current;
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const to = active ? 1 : hover ? 0.6 : 0;
    const anim = (v, val) => (theme.motion ? Animated.spring(v, { toValue: val, useNativeDriver: false, speed: 18, bounciness: 7 }).start() : v.setValue(val));
    anim(shape, active || hover ? 1 : 0);
    anim(pill, to);
  }, [active, hover]);
  const radius = shape.interpolate({ inputRange: [0, 1], outputRange: [24, 16] });
  const pillH = pill.interpolate({ inputRange: [0, 0.6, 1], outputRange: [badge ? 8 : 0, 20, 36] });
  const bg = color || (active || hover ? accent || theme.accent : theme.elevated);
  const fg = color ? onColor(color) : active || hover ? '#fff' : theme.text;
  return (
    <View style={{ width: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
      <Animated.View style={{ position: 'absolute', left: 0, width: 4, height: pillH, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: theme.text }} />
      <Pressy onPress={onPress} onHoverChange={setHover} accessibilityLabel={label} radius={16} pressScale={0.92}>
        <Animated.View style={{ width: 48, height: 48, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {children || <Icon name={icon} size={24} color={fg} />}
        </Animated.View>
      </Pressy>
      {badge ? (
        <View style={{ position: 'absolute', right: 10, bottom: -2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.danger, borderWidth: 3, borderColor: theme.rail, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ServerRail({ onSelect }) {
  const theme = useTheme();
  const t = useT();
  const servers = useStore((s) => s.servers);
  const nav = useStore((s) => s.nav);
  const unread = useStore((s) => s.unread);
  const dms = useStore((s) => s.dms);
  const pending = useStore((s) => s.friends.filter((f) => f.status === 'pending' && f.direction === 'incoming').length);
  const dmUnread = dms.reduce((n, d) => n + (unread[d.id] || 0), 0);
  const canDownload = useCanDownloadDesktop();

  const openServer = (sv) => {
    const last = getState().lastChannel[sv.id];
    const channel = sv.channels.find((c) => c.id === last) || sv.channels.find((c) => c.type === 'text') || sv.channels[0];
    navigate({ section: 'server', serverId: sv.id, channelId: channel?.id || null });
    onSelect?.('nav');
  };

  return (
    <View style={{ width: 72, backgroundColor: theme.rail, paddingTop: 12 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        <RailItem active={nav.section === 'home'} onPress={() => navigate({ section: 'home' })} icon="flame" label={t('nav.home')} badge={dmUnread + pending} />
        <View style={{ height: 2, width: 32, borderRadius: 1, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 8 }} />
        {servers.map((sv) => {
          const count = sv.channels.reduce((n, c) => n + (unread[c.id] || 0), 0);
          return <RailItem key={sv.id} active={nav.section === 'server' && nav.serverId === sv.id} onPress={() => openServer(sv)} icon={sv.icon} color={sv.color} label={sv.name} badge={count} />;
        })}
        <RailItem onPress={() => openModal('addServer')} icon="add" label={t('nav.addServer')} accent={theme.success} />
        {canDownload ? <RailItem onPress={downloadDesktop} icon="download-outline" label={t('download.button')} accent={theme.success} /> : null}
      </ScrollView>
    </View>
  );
}

// ---------- Seitenleiste ----------

function ListItem({ icon, label, active, onPress, unread, right, muted, onLongPress, children }) {
  const theme = useTheme();
  return (
    <Pressy onPress={onPress} onLongPress={onLongPress} radius={10} style={{ marginHorizontal: 8, marginVertical: 1, borderRadius: 10, backgroundColor: active ? theme.active : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
        {children || <Icon name={icon} size={19} color={active || unread ? theme.text : theme.textFaint} />}
        <Text numberOfLines={1} style={{ flex: 1, color: active || unread ? theme.text : muted ? theme.textFaint : theme.textMuted, fontWeight: unread || active ? '700' : '500', fontSize: theme.fs(15) }}>
          {label}
        </Text>
        {right}
        {unread ? (
          <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressy>
  );
}

function SectionHeader({ title, onAdd }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 10, marginTop: 16, marginBottom: 4 }}>
      <Text style={{ flex: 1, color: theme.textFaint, fontSize: theme.fs(11.5), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>{title}</Text>
      {onAdd ? <IconButton icon="add" size={18} box={26} onPress={onAdd} /> : null}
    </View>
  );
}

function HomeSidebar({ onOpen }) {
  const theme = useTheme();
  const t = useT();
  const nav = useStore((s) => s.nav);
  const me = useStore((s) => s.me);
  const dms = useStore((s) => s.dms);
  const unread = useStore((s) => s.unread);
  const voiceRooms = useStore((s) => s.voiceRooms);
  const pending = useStore((s) => s.friends.filter((f) => f.status === 'pending' && f.direction === 'incoming').length);
  const sorted = [...dms].sort((a, b) => b.lastActivity - a.lastActivity);
  return (
    <>
      <View style={{ height: 56, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border }}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: theme.fs(17) }}>{t('appName')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        <ListItem
          icon="people"
          label={t('nav.friends')}
          active={nav.section === 'home' && nav.homeTab === 'friends'}
          unread={pending}
          onPress={() => {
            navigate({ section: 'home', homeTab: 'friends', dmId: null });
            onOpen();
          }}
        />
        <SectionHeader title={t('nav.directMessages')} onAdd={() => openModal('newGroup')} />
        {sorted.length === 0 ? <Text style={{ color: theme.textFaint, paddingHorizontal: 18, paddingVertical: 8, fontSize: theme.fs(13) }}>{t('nav.noDms')}</Text> : null}
        {sorted.map((dm) => {
          const other = dm.members.find((m) => m.id !== me.id);
          const inCall = !!voiceRooms[dm.id]?.length;
          return (
            <ListItem
              key={dm.id}
              label={dmTitle(dm, me.id)}
              active={nav.section === 'home' && nav.dmId === dm.id}
              unread={unread[dm.id]}
              onPress={() => {
                navigate({ section: 'home', homeTab: 'dm', dmId: dm.id });
                onOpen();
              }}
              right={inCall ? <Icon name="call" size={15} color={theme.success} /> : null}
            >
              {dm.isGroup ? (
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="people" size={17} color="#fff" />
                </View>
              ) : (
                <Avatar user={other} size={32} showStatus ring={theme.sidebar} />
              )}
            </ListItem>
          );
        })}
      </ScrollView>
    </>
  );
}

function ServerSidebar({ server, onOpen }) {
  const theme = useTheme();
  const t = useT();
  const nav = useStore((s) => s.nav);
  const unread = useStore((s) => s.unread);
  const voiceRooms = useStore((s) => s.voiceRooms);
  const v = useVoice();
  const isAdmin = server.myRole === 'admin' || server.myRole === 'owner';
  const text = server.channels.filter((c) => c.type === 'text');
  const voiceChannels = server.channels.filter((c) => c.type === 'voice');
  const memberById = Object.fromEntries(server.members.map((m) => [m.id, m]));

  const channelMenu = (c) => isAdmin && openModal('channelMenu', { channel: c, server });

  return (
    <>
      <Pressy onPress={() => openModal('serverMenu', { server })} radius={0} style={{ height: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8, height: 56 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontWeight: '800', fontSize: theme.fs(16) }}>{server.name}</Text>
          <Icon name="chevron-down" size={18} color={theme.textMuted} />
        </View>
      </Pressy>
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        <SectionHeader title={t('nav.textChannels')} onAdd={isAdmin ? () => openModal('createChannel', { server, type: 'text' }) : null} />
        {text.map((c) => (
          <ListItem
            key={c.id}
            icon="chatbubble-ellipses-outline"
            label={c.name}
            active={nav.section === 'server' && nav.channelId === c.id}
            unread={unread[c.id]}
            onPress={() => {
              navigate({ section: 'server', serverId: server.id, channelId: c.id });
              onOpen();
            }}
            onLongPress={() => channelMenu(c)}
            right={isAdmin && Platform.OS === 'web' ? <IconButton icon="settings-outline" size={15} box={24} onPress={() => channelMenu(c)} /> : null}
          />
        ))}
        <SectionHeader title={t('nav.voiceChannels')} onAdd={isAdmin ? () => openModal('createChannel', { server, type: 'voice' }) : null} />
        {voiceChannels.map((c) => {
          const participants = voiceRooms[c.id] || [];
          return (
            <View key={c.id}>
              <ListItem
                icon="volume-high-outline"
                label={c.name}
                active={(nav.section === 'server' && nav.channelId === c.id) || v.roomId === c.id}
                onPress={() => {
                  navigate({ section: 'server', serverId: server.id, channelId: c.id });
                  if (v.roomId !== c.id) voice.join(c.id);
                  onOpen();
                }}
                onLongPress={() => channelMenu(c)}
                right={isAdmin && Platform.OS === 'web' ? <IconButton icon="settings-outline" size={15} box={24} onPress={() => channelMenu(c)} /> : null}
              />
              {participants.map((p) => {
                const u = memberById[p.userId];
                const speaking = v.roomId === c.id && v.speaking.includes(p.userId);
                return (
                  <View key={p.socketId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 44, paddingRight: 14, paddingVertical: 4 }}>
                    <Avatar user={u} size={22} speaking={speaking} />
                    <Text numberOfLines={1} style={{ flex: 1, color: speaking ? theme.text : theme.textMuted, fontSize: theme.fs(13.5) }}>{u?.nickname || u?.displayName || '…'}</Text>
                    {p.screen ? <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', backgroundColor: theme.danger, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' }}>LIVE</Text> : null}
                    {p.video ? <Icon name="videocam" size={13} color={theme.textFaint} /> : null}
                    {p.deafened ? <Icon name="volume-mute" size={13} color={theme.danger} /> : p.muted ? <Icon name="mic-off" size={13} color={theme.danger} /> : null}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

// ---------- Unteres Panel ----------

function VoicePanel() {
  const theme = useTheme();
  const t = useT();
  const v = useVoice();
  const servers = useStore((s) => s.servers);
  const dms = useStore((s) => s.dms);
  const me = useStore((s) => s.me);
  if (!v.roomId) return null;
  let title = '';
  let sub = '';
  let target = null;
  for (const sv of servers) {
    const c = sv.channels.find((x) => x.id === v.roomId);
    if (c) {
      title = c.name;
      sub = sv.name;
      target = { section: 'server', serverId: sv.id, channelId: c.id };
    }
  }
  const dm = dms.find((d) => d.id === v.roomId);
  if (dm) {
    title = dmTitle(dm, me.id);
    sub = t('voice.inCall');
    target = { section: 'home', homeTab: 'dm', dmId: dm.id };
  }
  const color = v.status === 'connected' ? theme.success : theme.textMuted;
  return (
    <FadeIn style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border, padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressy onPress={() => target && navigate(target)} style={{ flex: 1, borderRadius: 8, padding: 2 }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="cellular" size={14} color={color} />
              <Text style={{ color, fontWeight: '700', fontSize: theme.fs(13.5) }}>{v.status === 'connected' ? t('voice.connected') : t('voice.connecting')}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: theme.fs(12) }}>
              {title} / {sub}
            </Text>
          </View>
        </Pressy>
        <IconButton icon="call" size={18} danger onPress={() => voice.leave()} label={t('voice.leave')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <IconButton icon={v.video ? 'videocam' : 'videocam-outline'} active={v.video} filled onPress={() => voice.toggleCamera()} style={{ flex: 1 }} label={t('voice.camera')} />
        {voice.screenSupported ? <IconButton icon="desktop-outline" active={v.screen} filled onPress={() => voice.toggleScreen()} style={{ flex: 1 }} label={t('voice.screen')} /> : null}
      </View>
    </FadeIn>
  );
}

function UserPanel() {
  const theme = useTheme();
  const t = useT();
  const me = useStore((s) => s.me);
  const connected = useStore((s) => s.connected);
  const v = useVoice();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, backgroundColor: theme.rail + 'aa' }}>
      <Pressy onPress={() => openModal('statusPicker')} style={{ flex: 1, borderRadius: 10, padding: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar user={{ ...me, status: connected ? me.status : 'offline' }} size={34} showStatus ring={theme.rail} speaking={v.speaking.includes(me.id)} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: theme.fs(13.5) }}>{me.displayName}</Text>
            <Text numberOfLines={1} style={{ color: theme.textFaint, fontSize: theme.fs(11.5) }}>{me.customStatus || `@${me.username}`}</Text>
          </View>
        </View>
      </Pressy>
      <IconButton icon={v.muted ? 'mic-off' : 'mic'} color={v.muted ? theme.danger : undefined} onPress={() => voice.toggleMute()} label={v.muted ? t('voice.unmute') : t('voice.mute')} />
      <IconButton icon={v.deafened ? 'volume-mute' : 'headset'} color={v.deafened ? theme.danger : undefined} onPress={() => voice.toggleDeafen()} label={v.deafened ? t('voice.undeafen') : t('voice.deafen')} />
      <IconButton icon="settings-sharp" onPress={() => openModal('settings')} label={t('nav.settings')} />
    </View>
  );
}

function Sidebar({ onOpen }) {
  const theme = useTheme();
  const nav = useStore((s) => s.nav);
  const server = useStore((s) => s.servers.find((x) => x.id === s.nav.serverId));
  return (
    <View style={{ flex: 1, backgroundColor: theme.sidebar }}>
      <View style={{ flex: 1 }}>{nav.section === 'server' && server ? <ServerSidebar server={server} onOpen={onOpen} /> : <HomeSidebar onOpen={onOpen} />}</View>
      <VoicePanel />
      <UserPanel />
    </View>
  );
}

// Hinweis, solange die Echtzeitverbindung fehlt (z. B. während ein Gratis-Server aufwacht).
function ConnectionBanner() {
  const theme = useTheme();
  const t = useT();
  const connected = useStore((s) => s.connected);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (connected) return setShow(false);
    // Kurze Aussetzer nicht anzeigen.
    const timer = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(timer);
  }, [connected]);
  if (!show) return null;
  return (
    <FadeIn from={-6} style={{ backgroundColor: theme.accent, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Icon name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: theme.fs(13), textAlign: 'center', flexShrink: 1 }}>{t('nav.reconnecting')}</Text>
    </FadeIn>
  );
}

// ---------- Inhalt ----------

function Content({ onBack, showMembers, toggleMembers }) {
  const t = useT();
  const nav = useStore((s) => s.nav);
  const server = useStore((s) => s.servers.find((x) => x.id === s.nav.serverId));
  const dm = useStore((s) => s.dms.find((x) => x.id === s.nav.dmId));
  if (nav.section === 'server' && server) {
    const channel = server.channels.find((c) => c.id === nav.channelId);
    if (!channel) return <EmptyState icon="chatbubbles-outline" title={server.name} subtitle={t('server.noTextChannel')} />;
    if (channel.type === 'voice') return <VoiceView key={channel.id} roomId={channel.id} title={channel.name} server={server} onBack={onBack} />;
    return <ChatView key={channel.id} channelId={channel.id} server={server} channel={channel} onBack={onBack} showMembers={showMembers} toggleMembers={toggleMembers} />;
  }
  if (nav.section === 'home' && nav.homeTab === 'dm' && dm) return <ChatView key={dm.id} channelId={dm.id} dm={dm} onBack={onBack} showMembers={showMembers} toggleMembers={toggleMembers} />;
  return <FriendsView onBack={onBack} />;
}

export default function MainScreen() {
  const theme = useTheme();
  const mobile = useIsMobile();
  const { width } = useWindowDimensions();
  const [pane, setPane] = useState('nav');
  const [showMembers, setShowMembers] = useState(true);
  const nav = useStore((s) => s.nav);
  const server = useStore((s) => s.servers.find((x) => x.id === s.nav.serverId));
  const dm = useStore((s) => s.dms.find((x) => x.id === s.nav.dmId));
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!mobile) return;
    const to = pane === 'content' ? 1 : 0;
    theme.motion ? Animated.spring(slide, { toValue: to, useNativeDriver: Platform.OS !== 'web', speed: 16, bounciness: 0 }).start() : slide.setValue(to);
  }, [pane, mobile]);

  // Android-Zurück-Taste: vom Inhalt zur Navigation.
  useEffect(() => {
    if (!mobile || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (getState().modal || getState().screen) {
        closeModal();
        return true;
      }
      if (pane === 'content') {
        setPane('nav');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [mobile, pane]);

  const channel = server?.channels.find((c) => c.id === nav.channelId);
  const membersVisible = showMembers && ((nav.section === 'server' && channel?.type === 'text') || (nav.section === 'home' && nav.homeTab === 'dm' && dm?.isGroup));

  if (mobile) {
    const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
    const contentX = slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] });
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.rail }} edges={['top', 'bottom']}>
        <ConnectionBanner />
        <Animated.View style={{ flex: 1, flexDirection: 'row', transform: [{ translateX }] }}>
          <ServerRail />
          <Sidebar onOpen={() => setPane('content')} />
        </Animated.View>
        <Animated.View
          pointerEvents={pane === 'content' ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, opacity: slide, transform: [{ translateX: contentX }] }]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <Content onBack={() => setPane('nav')} showMembers={false} toggleMembers={() => openModal('members', {})} />
          </SafeAreaView>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ConnectionBanner />
      <View style={{ flex: 1, flexDirection: 'row' }}>
      <ServerRail />
      <View style={{ width: 260 }}>
        <Sidebar onOpen={() => {}} />
      </View>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <Content showMembers={membersVisible} toggleMembers={() => setShowMembers(!showMembers)} />
      </View>
      {membersVisible ? (
        <FadeIn from={0} style={{ width: 250, backgroundColor: theme.sidebar }}>
          <MemberList />
        </FadeIn>
      ) : null}
      </View>
    </View>
  );
}
