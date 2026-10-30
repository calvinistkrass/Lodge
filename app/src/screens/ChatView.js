import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Platform, KeyboardAvoidingView, ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../theme';
import { useT, errorText } from '../i18n';
import { useStore, openModal, dmTitle, showToast, findUser } from '../store';
import { api, loadMessages, sendTyping, upsertMessage } from '../api';
import { Avatar, Icon, IconButton, Pressy, useIsMobile, FadeIn } from '../ui';
import { MessageText, SYMBOLS } from '../symbols';
import { formatTime, formatDay, formatStamp } from '../util';
import { useVoice, voice } from '../voice/engine';
import Header from './Header';
import { VoiceStage } from './VoiceView';

const GROUP_WINDOW = 5 * 60 * 1000;

function DayDivider({ ts }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14, paddingHorizontal: 16 }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
      <Text style={{ color: theme.textFaint, fontSize: theme.fs(11.5), fontWeight: '700' }}>{formatDay(ts, t)}</Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
    </View>
  );
}

function Reactions({ message, meId }) {
  const theme = useTheme();
  const entries = Object.entries(message.reactions || {});
  if (!entries.length) return null;
  const toggle = (icon) => api.post(`/messages/${message.id}/reactions`, { icon }).catch(() => {});
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {entries.map(([icon, users]) => {
        const mine = users.includes(meId);
        return (
          <Pressy key={icon} onPress={() => toggle(icon)} pressScale={0.9} style={{ borderRadius: 10, borderWidth: 1.5, borderColor: mine ? theme.accent : 'transparent', backgroundColor: mine ? theme.accentSoft : theme.input }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Icon name={icon} size={15} color={mine ? theme.accent : theme.textMuted} />
              <Text style={{ color: mine ? theme.accent : theme.textMuted, fontWeight: '700', fontSize: theme.fs(12.5) }}>{users.length}</Text>
            </View>
          </Pressy>
        );
      })}
    </View>
  );
}

function Message({ m, grouped, me, canModerate, onReply, onEdit, compact, showTimestamps, memberMap }) {
  const theme = useTheme();
  const t = useT();
  const mobile = useIsMobile();
  const [hover, setHover] = useState(false);
  const author = memberMap[m.author?.id] || m.author || { displayName: '?', id: null };
  const name = author.nickname || author.displayName;
  const mine = m.author?.id === me.id;
  const mentioned = m.content.toLowerCase().includes(`@${me.username.toLowerCase()}`);

  const actions = {
    reply: () => onReply(m),
    edit: () => onEdit(m),
    react: () => openModal('reactionPicker', { messageId: m.id }),
    copy: async () => {
      await Clipboard.setStringAsync(m.content);
      showToast(t('common.copied'));
    },
    remove: () =>
      openModal('confirm', {
        title: t('common.delete'),
        text: t('chat.deleteConfirm'),
        danger: true,
        confirmLabel: t('common.delete'),
        onConfirm: () => api.del(`/messages/${m.id}`),
      }),
  };

  const menu = () => openModal('messageMenu', { message: m, mine, canDelete: mine || canModerate, actions });

  return (
    <Pressy
      onLongPress={mobile ? menu : undefined}
      onHoverChange={setHover}
      pressScale={mobile ? 0.985 : 1}
      radius={0}
      style={{ backgroundColor: mentioned ? theme.accent + '18' : 'transparent', borderLeftWidth: mentioned ? 3 : 0, borderLeftColor: theme.accent }}
    >
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: grouped ? 2 : compact ? 6 : 14, paddingBottom: 2, gap: 14 }}>
        <View style={{ width: 40, alignItems: 'center' }}>
          {!grouped ? (
            <Pressy onPress={() => author.id && openModal('profile', { userId: author.id })} radius={20} pressScale={0.9}>
              <Avatar user={author} size={compact ? 28 : 40} />
            </Pressy>
          ) : hover || showTimestamps ? (
            <Text style={{ color: theme.textFaint, fontSize: 10.5, marginTop: 4 }}>{formatTime(m.createdAt)}</Text>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {m.replyTo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, opacity: 0.8 }}>
              <Icon name="return-up-forward" size={14} color={theme.textFaint} />
              <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: theme.fs(12.5) }}>{m.replyTo.author?.displayName}</Text>
              <Text numberOfLines={1} style={{ color: theme.textFaint, fontSize: theme.fs(12.5), flex: 1 }}>
                {m.replyTo.content}
              </Text>
            </View>
          ) : null}
          {!grouped ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <Text style={{ color: author.avatarColor && theme.isDark ? author.avatarColor : theme.text, fontWeight: '700', fontSize: theme.fs(15) }}>{name}</Text>
              <Text style={{ color: theme.textFaint, fontSize: theme.fs(11.5) }}>{formatStamp(m.createdAt, t)}</Text>
            </View>
          ) : null}
          <MessageText content={m.content} theme={theme} meName={me.username} />
          {m.editedAt ? <Text style={{ color: theme.textFaint, fontSize: theme.fs(11) }}>{t('chat.edited')}</Text> : null}
          <Reactions message={m} meId={me.id} />
        </View>
      </View>
      {hover && !mobile ? (
        <FadeIn from={4} style={{ position: 'absolute', right: 16, top: -14, flexDirection: 'row', backgroundColor: theme.elevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 }}>
          <IconButton icon="happy-outline" size={18} box={32} onPress={actions.react} label={t('chat.react')} />
          <IconButton icon="arrow-undo-outline" size={18} box={32} onPress={actions.reply} label={t('chat.reply')} />
          {mine ? <IconButton icon="create-outline" size={18} box={32} onPress={actions.edit} label={t('common.edit')} /> : null}
          {mine || canModerate ? <IconButton icon="trash-outline" size={18} box={32} color={theme.danger} onPress={actions.remove} label={t('common.delete')} /> : null}
        </FadeIn>
      ) : null}
    </Pressy>
  );
}

function TypingLine({ channelId }) {
  const theme = useTheme();
  const t = useT();
  const typing = useStore((s) => s.typing[channelId]);
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 1500);
    return () => clearInterval(i);
  }, []);
  const names = Object.entries(typing || {})
    .filter(([, ts]) => Date.now() - ts < 6000)
    .map(([uid]) => findUser(uid)?.displayName)
    .filter(Boolean);
  const text = !names.length ? '' : names.length === 1 ? t('chat.typing1', { a: names[0] }) : names.length === 2 ? t('chat.typing2', { a: names[0], b: names[1] }) : t('chat.typingMany');
  return (
    <View style={{ height: 20, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {text ? <Icon name="ellipsis-horizontal" size={16} color={theme.accent} /> : null}
      <Text style={{ color: theme.textMuted, fontSize: theme.fs(12) }}>{text}</Text>
    </View>
  );
}

function SymbolBar({ onPick }) {
  const theme = useTheme();
  return (
    <FadeIn style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8, marginHorizontal: 16, marginBottom: 6, backgroundColor: theme.elevated, borderRadius: 14, borderWidth: 1, borderColor: theme.border }}>
      {Object.entries(SYMBOLS).map(([key, s]) => (
        <Pressy key={key} onPress={() => onPick(key)} radius={10} pressScale={0.85} style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={s.icon} size={22} color={s.color} />
        </Pressy>
      ))}
    </FadeIn>
  );
}

function Composer({ channelId, placeholder, replyTo, setReplyTo, editing, setEditing }) {
  const theme = useTheme();
  const t = useT();
  const settings = useStore((s) => s.settings);
  const [text, setText] = useState('');
  const [height, setHeight] = useState(44);
  const [symbols, setSymbols] = useState(false);
  const lastTyping = useRef(0);
  const input = useRef(null);

  useEffect(() => {
    if (editing) {
      setText(editing.content);
      input.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    setHeight(44);
    setSymbols(false);
    try {
      if (editing) {
        upsertMessage(await api.patch(`/messages/${editing.id}`, { content }));
        setEditing(null);
      } else {
        upsertMessage(await api.post(`/channels/${channelId}/messages`, { content, replyTo: replyTo?.id }));
        setReplyTo(null);
      }
    } catch (e) {
      setText(content);
      showToast(errorText(t, e), 'error');
    }
  };

  const onChange = (v) => {
    setText(v);
    if (!editing && Date.now() - lastTyping.current > 3000 && v) {
      lastTyping.current = Date.now();
      sendTyping(channelId);
    }
  };

  const onKeyPress = (e) => {
    if (Platform.OS !== 'web') return;
    const ev = e.nativeEvent;
    if (ev.key === 'Enter' && !ev.shiftKey && settings.enterToSend) {
      e.preventDefault();
      send();
    } else if (ev.key === 'Escape') {
      if (editing) {
        setEditing(null);
        setText('');
      }
      setReplyTo(null);
    }
  };

  const banner = editing ? t('chat.editing') : replyTo ? t('chat.replyingTo', { name: replyTo.author?.displayName }) : null;

  return (
    <View style={{ paddingBottom: Platform.OS === 'web' ? 4 : 8 }}>
      {symbols ? <SymbolBar onPick={(k) => setText((x) => `${x}${x && !x.endsWith(' ') ? ' ' : ''}:${k}: `)} /> : null}
      {banner ? (
        <FadeIn style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.panel, borderTopLeftRadius: 14, borderTopRightRadius: 14, gap: 8 }}>
          <Icon name={editing ? 'create-outline' : 'arrow-undo-outline'} size={15} color={theme.textMuted} />
          <Text style={{ flex: 1, color: theme.textMuted, fontSize: theme.fs(12.5) }}>{banner}</Text>
          <IconButton
            icon="close-circle"
            size={18}
            box={24}
            onPress={() => {
              setReplyTo(null);
              if (editing) {
                setEditing(null);
                setText('');
              }
            }}
          />
        </FadeIn>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginHorizontal: 16, backgroundColor: theme.input, borderRadius: 16, borderTopLeftRadius: banner ? 0 : 16, borderTopRightRadius: banner ? 0 : 16, paddingHorizontal: 6, gap: 2 }}>
        <IconButton icon={symbols ? 'happy' : 'happy-outline'} active={symbols} onPress={() => setSymbols(!symbols)} style={{ marginBottom: 4 }} />
        <TextInput
          ref={input}
          value={text}
          onChangeText={onChange}
          onKeyPress={onKeyPress}
          placeholder={placeholder}
          placeholderTextColor={theme.textFaint}
          multiline
          onContentSizeChange={(e) => setHeight(Math.min(160, Math.max(44, e.nativeEvent.contentSize.height + (Platform.OS === 'web' ? 0 : 12))))}
          style={[{ flex: 1, color: theme.text, fontSize: theme.fs(15), height, paddingVertical: 12, paddingHorizontal: 6, textAlignVertical: 'center' }, Platform.OS === 'web' && { outlineStyle: 'none', resize: 'none' }]}
        />
        <IconButton icon="send" active={!!text.trim()} color={theme.textFaint} onPress={send} style={{ marginBottom: 4 }} />
      </View>
    </View>
  );
}

export default function ChatView({ channelId, server, channel, dm, onBack, showMembers, toggleMembers }) {
  const theme = useTheme();
  const t = useT();
  const me = useStore((s) => s.me);
  const settings = useStore((s) => s.settings);
  const data = useStore((s) => s.messages[channelId]);
  const callParticipants = useStore((s) => (dm ? s.voiceRooms[dm.id] : null));
  const v = useVoice();
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadMessages(channelId).catch((e) => showToast(errorText(t, e), 'error'));
  }, [channelId]);

  const memberMap = useMemo(() => Object.fromEntries((server?.members || dm?.members || []).map((m) => [m.id, m])), [server, dm]);
  const canModerate = server && (server.myRole === 'admin' || server.myRole === 'owner');

  const items = useMemo(() => {
    const list = data?.items || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const prev = list[i - 1];
      const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
      const grouped = !newDay && prev && prev.author?.id === m.author?.id && m.createdAt - prev.createdAt < GROUP_WINDOW && !m.replyTo;
      if (newDay) out.push({ type: 'day', id: `day-${m.id}`, ts: m.createdAt });
      out.push({ type: 'msg', id: m.id, m, grouped });
    }
    return out.reverse();
  }, [data]);

  const title = dm ? dmTitle(dm, me.id) : channel.name;
  const other = dm && !dm.isGroup ? dm.members.find((m) => m.id !== me.id) : null;
  const inThisCall = dm && v.roomId === dm.id;
  const callActive = dm && (callParticipants?.length || inThisCall);

  const loadOlder = async () => {
    if (!data?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadMessages(channelId, true);
    } finally {
      setLoadingMore(false);
    }
  };

  const intro = (
    <View style={{ padding: 20, paddingTop: 40, gap: 8 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: theme.elevated, alignItems: 'center', justifyContent: 'center' }}>
        {other ? <Avatar user={other} size={68} /> : <Icon name={dm ? 'people' : 'chatbubbles'} size={32} color={theme.text} />}
      </View>
      <Text style={{ color: theme.text, fontSize: theme.fs(26), fontWeight: '800' }}>{dm ? title : t('server.welcome', { name: title })}</Text>
      <Text style={{ color: theme.textMuted, fontSize: theme.fs(14) }}>{dm ? (dm.isGroup ? t('chat.groupStart', { name: title }) : t('chat.dmStart', { name: title })) : t('server.welcomeSub', { name: title })}</Text>
    </View>
  );

  const headerRight = (
    <>
      {dm ? (
        <>
          <IconButton icon="call" active={inThisCall} onPress={() => (inThisCall ? null : voice.join(dm.id))} label={t('voice.startCall')} />
          <IconButton
            icon="videocam"
            onPress={async () => {
              if (!inThisCall) await voice.join(dm.id);
              if (!voice.cameraTrack) voice.toggleCamera();
            }}
            label={t('voice.camera')}
          />
          {dm.isGroup ? <IconButton icon="person-add" onPress={() => openModal('groupMenu', { dm })} /> : null}
        </>
      ) : null}
      {(server || dm?.isGroup) ? <IconButton icon="people" active={showMembers} onPress={toggleMembers} label={t('nav.members')} /> : null}
    </>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <Header
        icon={dm ? null : 'chatbubble-ellipses-outline'}
        iconNode={other ? <Avatar user={other} size={28} showStatus ring={theme.bg} /> : dm ? <Icon name="people" size={22} color={theme.textFaint} /> : null}
        title={title}
        subtitle={channel?.topic || (other?.customStatus ?? '')}
        onBack={onBack}
        right={headerRight}
      />
      {callActive ? <VoiceStage roomId={dm.id} compact members={dm.members} /> : null}
      {!data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          inverted
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          ListFooterComponent={data.hasMore ? <ActivityIndicator style={{ margin: 16 }} color={theme.accent} /> : intro}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <DayDivider ts={item.ts} />
            ) : (
              <Message m={item.m} grouped={item.grouped} me={me} canModerate={canModerate} onReply={setReplyTo} onEdit={setEditing} compact={settings.compact} showTimestamps={settings.showTimestamps} memberMap={memberMap} />
            )
          }
        />
      )}
      <TypingLine channelId={channelId} />
      <Composer channelId={channelId} placeholder={t('chat.placeholder', { name: dm ? title : `#${title}` })} replyTo={replyTo} setReplyTo={setReplyTo} editing={editing} setEditing={setEditing} />
    </KeyboardAvoidingView>
  );
}
