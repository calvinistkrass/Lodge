import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Pressable, ScrollView, Platform, StyleSheet, KeyboardAvoidingView, Easing } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../theme';
import { useT, errorText } from '../i18n';
import { useStore, setState, closeModal, openModal, showToast, navigate, getState, findUser } from '../store';
import { api, openDm } from '../api';
import { Button, Input, Icon, IconButton, Avatar, Pressy, Swatches, IconPicker, Segmented, useIsMobile, Divider, StatusDot, FadeIn } from '../ui';
import { parseInviteInput, inviteLink } from '../util';
import { voice } from '../voice/engine';
import { MemberList } from './MemberList';
import SettingsScreen from './SettingsScreen';
import ServerSettings from './ServerSettings';

const NATIVE = Platform.OS !== 'web';

// ---------- Grundgerüst ----------

function Sheet({ children, onClose, width = 460 }) {
  const theme = useTheme();
  const mobile = useIsMobile();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    theme.motion ? Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 18, bounciness: 5 }).start() : v.setValue(1);
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [mobile ? 60 : 12, 0] });
  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: mobile ? 'flex-end' : 'center', alignItems: 'center' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay, opacity: v }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
        <Animated.View
          style={{
            width: mobile ? '100%' : width,
            maxWidth: '100%',
            maxHeight: mobile ? '92%' : '86%',
            backgroundColor: theme.panel,
            borderRadius: 22,
            borderBottomLeftRadius: mobile ? 0 : 22,
            borderBottomRightRadius: mobile ? 0 : 22,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: v,
            transform: [{ scale }, { translateY }],
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 40,
            shadowOffset: { width: 0, height: 20 },
            overflow: 'hidden',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 22, gap: 16, paddingBottom: mobile ? 34 : 22 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Title({ children, sub, icon }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon ? <Icon name={icon} size={22} color={theme.accent} /> : null}
        <Text style={{ color: theme.text, fontSize: theme.fs(20), fontWeight: '800', flex: 1 }}>{children}</Text>
      </View>
      {sub ? <Text style={{ color: theme.textMuted, fontSize: theme.fs(14) }}>{sub}</Text> : null}
    </View>
  );
}

function Actions({ children }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>{children}</View>;
}

function useAction() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function ErrorLine({ text }) {
  const theme = useTheme();
  return text ? <Text style={{ color: theme.danger, fontSize: theme.fs(13) }}>{text}</Text> : null;
}

// ---------- Modals ----------

function ConfirmModal({ title, text, danger, confirmLabel, onConfirm, password }) {
  const t = useT();
  const { busy, error, run } = useAction();
  const [pw, setPw] = useState('');
  return (
    <Sheet onClose={closeModal}>
      <Title icon={danger ? 'warning' : 'help-circle'}>{title}</Title>
      <Text style={{ color: useTheme().textMuted, fontSize: 15 }}>{text}</Text>
      {password ? <Input label={t('common.password')} value={pw} onChangeText={setPw} secureTextEntry autoFocus /> : null}
      <ErrorLine text={error} />
      <Actions>
        <Button variant="ghost" title={t('common.cancel')} onPress={closeModal} />
        <Button
          variant={danger ? 'danger' : 'primary'}
          title={confirmLabel || t('common.confirm')}
          loading={busy}
          onPress={() =>
            run(async () => {
              await onConfirm(pw);
              closeModal();
            })
          }
        />
      </Actions>
    </Sheet>
  );
}

function ActionMenu({ title, header, items }) {
  const theme = useTheme();
  return (
    <Sheet onClose={closeModal} width={380}>
      {header}
      {title ? <Text style={{ color: theme.text, fontWeight: '800', fontSize: theme.fs(17) }}>{title}</Text> : null}
      <View style={{ gap: 2, marginHorizontal: -8 }}>
        {items.filter(Boolean).map((it, i) => (
          <Pressy
            key={i}
            onPress={() => {
              closeModal();
              setTimeout(it.onPress, 10);
            }}
            style={{ borderRadius: 12 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 12 }}>
              <Icon name={it.icon} size={20} color={it.danger ? theme.danger : theme.textMuted} />
              <Text style={{ color: it.danger ? theme.danger : theme.text, fontSize: theme.fs(15), fontWeight: '500' }}>{it.label}</Text>
            </View>
          </Pressy>
        ))}
      </View>
    </Sheet>
  );
}

function ServerForm({ initial = {}, onSubmit, submitLabel, busy }) {
  const t = useT();
  const icons = useStore((s) => s.serverIcons);
  const colors = useStore((s) => s.colors);
  const [name, setName] = useState(initial.name || '');
  const [icon, setIcon] = useState(initial.icon || icons[0] || 'planet');
  const [color, setColor] = useState(initial.color || colors[0] || '#7c5cff');
  const theme = useTheme();
  return (
    <>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={40} color="#fff" />
        </View>
      </View>
      <Input label={t('server.name')} value={name} onChangeText={setName} autoFocus={Platform.OS === 'web'} onSubmitEditing={() => onSubmit({ name, icon, color })} />
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('server.icon')}</Text>
      <IconPicker icons={icons} value={icon} onChange={setIcon} color={color} />
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('server.color')}</Text>
      <Swatches colors={colors} value={color} onChange={setColor} />
      <Actions>
        <Button variant="ghost" title={t('common.cancel')} onPress={closeModal} />
        <Button title={submitLabel} loading={busy} disabled={!name.trim()} onPress={() => onSubmit({ name, icon, color })} />
      </Actions>
    </>
  );
}

function AddServerModal() {
  const t = useT();
  const [tab, setTab] = useState('create');
  const { busy, error, run } = useAction();
  const [invite, setInvite] = useState('');
  return (
    <Sheet onClose={closeModal}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'create', label: t('server.create'), icon: 'add-circle-outline' },
          { value: 'join', label: t('server.join'), icon: 'enter-outline' },
        ]}
      />
      {tab === 'create' ? (
        <FadeIn key="c" style={{ gap: 16 }}>
          <Title sub={t('server.createSub')}>{t('server.create')}</Title>
          <ServerForm
            submitLabel={t('common.create')}
            busy={busy}
            onSubmit={(data) =>
              run(async () => {
                const sv = await api.post('/servers', data);
                setState((s) => ({ servers: s.servers.some((x) => x.id === sv.id) ? s.servers : [...s.servers, sv] }));
                navigate({ section: 'server', serverId: sv.id, channelId: (sv.channels.find((c) => c.type === 'text') || sv.channels[0])?.id });
                closeModal();
              })
            }
          />
          <ErrorLine text={error} />
        </FadeIn>
      ) : (
        <FadeIn key="j" style={{ gap: 16 }}>
          <Title sub={t('server.joinSub')}>{t('server.join')}</Title>
          <Input label={t('server.inviteLink')} value={invite} onChangeText={setInvite} autoCapitalize="none" autoCorrect={false} placeholder="https://…/invite/abc123" icon="link" />
          <ErrorLine text={error} />
          <Actions>
            <Button variant="ghost" title={t('common.cancel')} onPress={closeModal} />
            <Button title={t('common.join')} disabled={!parseInviteInput(invite)} onPress={() => openModal('joinServer', { code: parseInviteInput(invite) })} />
          </Actions>
        </FadeIn>
      )}
    </Sheet>
  );
}

function JoinServerModal({ code }) {
  const theme = useTheme();
  const t = useT();
  const [info, setInfo] = useState(null);
  const { busy, error, run } = useAction();
  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    api.get(`/invites/${code}`).then(setInfo, (e) => setLoadError(errorText(t, e)));
  }, [code]);
  return (
    <Sheet onClose={closeModal} width={400}>
      {loadError ? (
        <>
          <Title icon="alert-circle">{t('server.join')}</Title>
          <ErrorLine text={loadError} />
          <Actions>
            <Button title={t('common.close')} onPress={closeModal} />
          </Actions>
        </>
      ) : !info ? (
        <Text style={{ color: theme.textMuted }}>{t('common.loading')}</Text>
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: info.server.color, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={info.server.icon} size={40} color="#fff" />
            </View>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{info.server.name}</Text>
            {info.server.description ? <Text style={{ color: theme.textMuted, textAlign: 'center' }}>{info.server.description}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <StatusDot status="online" />
              <Text style={{ color: theme.textMuted }}>{t('server.memberCount', { n: info.server.memberCount })}</Text>
            </View>
          </View>
          <ErrorLine text={error} />
          <Button
            full
            title={info.alreadyMember ? t('server.alreadyMember') : t('common.join')}
            loading={busy}
            onPress={() =>
              run(async () => {
                const sv = await api.post(`/invites/${code}/join`);
                setState((s) => ({ servers: s.servers.some((x) => x.id === sv.id) ? s.servers.map((x) => (x.id === sv.id ? sv : x)) : [...s.servers, sv] }));
                navigate({ section: 'server', serverId: sv.id, channelId: sv.channels.find((c) => c.type === 'text')?.id });
                closeModal();
              })
            }
          />
        </>
      )}
    </Sheet>
  );
}

function InviteModal({ server }) {
  const theme = useTheme();
  const t = useT();
  const [code, setCode] = useState(null);
  const [expiry, setExpiry] = useState(168);
  const [maxUses, setMaxUses] = useState(0);
  const { error, run } = useAction();
  const create = () => run(async () => setCode((await api.post(`/servers/${server.id}/invites`, { expiresInHours: expiry, maxUses })).code));
  useEffect(() => {
    create();
  }, [expiry, maxUses]);
  const link = code ? inviteLink(code) : '';
  return (
    <Sheet onClose={closeModal}>
      <Title icon="person-add" sub={t('server.inviteSub')}>
        {t('server.invite')}
      </Title>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.input, borderRadius: 12, paddingLeft: 14, gap: 8 }}>
        <Text selectable numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 14 }}>
          {link || '…'}
        </Text>
        <Button
          small
          title={t('common.copy')}
          icon="copy-outline"
          style={{ margin: 5 }}
          onPress={async () => {
            await Clipboard.setStringAsync(link);
            showToast(t('common.copied'));
          }}
        />
      </View>
      <Text style={{ color: theme.textFaint, fontSize: 12 }}>Code: {code}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('server.inviteExpiry')}</Text>
      <Segmented
        value={expiry}
        onChange={setExpiry}
        options={[
          { value: 1, label: t('server.hours', { n: 1 }) },
          { value: 24, label: t('server.hours', { n: 24 }) },
          { value: 168, label: t('server.days', { n: 7 }) },
          { value: 0, label: t('server.never') },
        ]}
      />
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('server.inviteMaxUses')}</Text>
      <Segmented
        value={maxUses}
        onChange={setMaxUses}
        options={[
          { value: 0, label: t('server.unlimited') },
          { value: 1, label: '1' },
          { value: 10, label: '10' },
          { value: 50, label: '50' },
        ]}
      />
      <ErrorLine text={error} />
    </Sheet>
  );
}

function ChannelModal({ server, channel, type: initialType }) {
  const t = useT();
  const [name, setName] = useState(channel?.name || '');
  const [topic, setTopic] = useState(channel?.topic || '');
  const [type, setType] = useState(channel?.type || initialType || 'text');
  const { busy, error, run } = useAction();
  const submit = () =>
    run(async () => {
      if (channel) await api.patch(`/channels/${channel.id}`, { name, topic });
      else {
        const res = await api.post(`/servers/${server.id}/channels`, { name, type, topic });
        if (type === 'text') navigate({ section: 'server', serverId: server.id, channelId: res.id });
      }
      closeModal();
    });
  return (
    <Sheet onClose={closeModal}>
      <Title icon={type === 'voice' ? 'volume-high' : 'chatbubble-ellipses'}>{channel ? t('server.editChannel') : t('server.createChannel')}</Title>
      {!channel ? (
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'text', label: t('server.text'), icon: 'chatbubble-ellipses-outline' },
            { value: 'voice', label: t('server.voice'), icon: 'volume-high-outline' },
          ]}
        />
      ) : null}
      <Input label={t('server.channelName')} value={name} onChangeText={setName} autoFocus={Platform.OS === 'web'} onSubmitEditing={submit} />
      {type === 'text' ? <Input label={t('server.topic')} value={topic} onChangeText={setTopic} /> : null}
      <ErrorLine text={error} />
      <Actions>
        <Button variant="ghost" title={t('common.cancel')} onPress={closeModal} />
        <Button title={channel ? t('common.save') : t('common.create')} loading={busy} disabled={!name.trim()} onPress={submit} />
      </Actions>
    </Sheet>
  );
}

function ProfileModal({ userId, serverId }) {
  const theme = useTheme();
  const t = useT();
  const me = useStore((s) => s.me);
  const friend = useStore((s) => s.friends.find((f) => f.user.id === userId));
  const server = useStore((s) => s.servers.find((x) => x.id === serverId));
  const cached = findUser(userId);
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    api.get(`/users/${userId}`).then(setProfile, () => {});
  }, [userId]);
  const user = { ...(cached || {}), ...(profile || {}) };
  const member = server?.members.find((m) => m.id === userId);
  const isMe = userId === me.id;
  const myRole = server?.myRole;
  const canManage = server && !isMe && member && ((myRole === 'owner' && member.role !== 'owner') || (myRole === 'admin' && member.role === 'member'));
  const v = voice.getSnapshot();
  const inVoiceWithMe = v.roomId && (getState().voiceRooms[v.roomId] || []).some((p) => p.userId === userId) && !isMe;
  const [vol, setVol] = useState(Math.round((getState().settings.userVolumes?.[userId] ?? 1) * 100));

  const act = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      showToast(errorText(t, e), 'error');
    }
  };

  return (
    <Sheet onClose={closeModal} width={420}>
      <View style={{ height: 90, margin: -22, marginBottom: 0, backgroundColor: user.avatarColor || theme.accent }} />
      <View style={{ marginTop: -54, flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ borderWidth: 6, borderColor: theme.panel, borderRadius: 60 }}>
          <Avatar user={user} size={84} showStatus ring={theme.panel} />
        </View>
      </View>
      <View>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{member?.nickname || user.displayName}</Text>
        <Text style={{ color: theme.textMuted }}>@{user.username}</Text>
        {user.customStatus ? <Text style={{ color: theme.text, marginTop: 6 }}>{user.customStatus}</Text> : null}
      </View>
      {user.about ? (
        <View style={{ backgroundColor: theme.input, borderRadius: 12, padding: 12, gap: 4 }}>
          <Text style={{ color: theme.textFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{t('settings.aboutMe')}</Text>
          <Text style={{ color: theme.text }}>{user.about}</Text>
        </View>
      ) : null}
      {member ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name={member.role === 'owner' ? 'ribbon' : member.role === 'admin' ? 'shield-checkmark' : 'person'} size={15} color={theme.textMuted} />
          <Text style={{ color: theme.textMuted }}>{t(`server.${member.role}`)}</Text>
        </View>
      ) : null}
      {inVoiceWithMe && Platform.OS === 'web' ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.textFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
            {t('voice.volume')} – {vol}%
          </Text>
          <Segmented
            value={vol}
            onChange={(x) => {
              setVol(x);
              voice.setUserVolume(userId, x / 100);
            }}
            options={[0, 25, 50, 75, 100].map((x) => ({ value: x, label: `${x}%` }))}
          />
        </View>
      ) : null}
      {!isMe ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button
            icon="chatbubble"
            title={t('friends.message')}
            onPress={act(async () => {
              closeModal();
              await openDm([userId]);
            })}
          />
          {!friend ? (
            <Button
              variant="secondary"
              icon="person-add"
              title={t('friends.add')}
              onPress={act(async () => {
                await api.post('/friends', { userId });
                showToast(t('friends.requestSent'));
              })}
            />
          ) : friend.status === 'pending' && friend.direction === 'incoming' ? (
            <Button variant="success" icon="checkmark" title={t('friends.accept')} onPress={act(() => api.post(`/friends/${userId}/accept`))} />
          ) : null}
        </View>
      ) : null}
      {canManage ? (
        <>
          <Divider />
          <View style={{ gap: 2, marginHorizontal: -8 }}>
            {myRole === 'owner' ? (
              <MenuRow icon="shield-checkmark-outline" label={member.role === 'admin' ? t('server.removeAdmin') : t('server.makeAdmin')} onPress={act(() => api.patch(`/servers/${serverId}/members/${userId}`, { role: member.role === 'admin' ? 'member' : 'admin' }))} />
            ) : null}
            {myRole === 'owner' ? (
              <MenuRow
                icon="ribbon-outline"
                label={t('server.transfer')}
                onPress={() => openModal('confirm', { title: t('server.transfer'), text: t('server.transferConfirm', { name: user.displayName }), danger: true, onConfirm: () => api.post(`/servers/${serverId}/transfer`, { userId }) })}
              />
            ) : null}
            <MenuRow icon="exit-outline" danger label={t('server.kick')} onPress={act(async () => { await api.del(`/servers/${serverId}/members/${userId}`); closeModal(); })} />
            <MenuRow icon="ban" danger label={t('server.ban')} onPress={act(async () => { await api.del(`/servers/${serverId}/members/${userId}?ban=1`); closeModal(); })} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

function MenuRow({ icon, label, onPress, danger }) {
  const theme = useTheme();
  return (
    <Pressy onPress={onPress} style={{ borderRadius: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 11 }}>
        <Icon name={icon} size={19} color={danger ? theme.danger : theme.textMuted} />
        <Text style={{ color: danger ? theme.danger : theme.text, fontSize: 15 }}>{label}</Text>
      </View>
    </Pressy>
  );
}

function StatusPicker() {
  const theme = useTheme();
  const t = useT();
  const me = useStore((s) => s.me);
  const [custom, setCustom] = useState(me.customStatus || '');
  const set = (patch) => api.patch('/me', patch).catch(() => {});
  const statuses = [
    ['online', 'statusOnline'],
    ['idle', 'statusIdle'],
    ['dnd', 'statusDnd'],
    ['invisible', 'statusInvisible'],
  ];
  return (
    <Sheet onClose={closeModal} width={380}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar user={me} size={48} showStatus ring={theme.panel} />
        <View>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>{me.displayName}</Text>
          <Text style={{ color: theme.textMuted }}>@{me.username}</Text>
        </View>
      </View>
      <View style={{ gap: 2, marginHorizontal: -8 }}>
        {statuses.map(([value, key]) => (
          <Pressy key={value} onPress={() => set({ status: value })} style={{ borderRadius: 12, backgroundColor: me.status === value ? theme.active : 'transparent' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <StatusDot status={value} size={12} />
              <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>{t(`settings.${key}`)}</Text>
              {me.status === value ? <Icon name="checkmark" size={18} color={theme.accent} /> : null}
            </View>
          </Pressy>
        ))}
      </View>
      <Input label={t('settings.customStatus')} value={custom} onChangeText={setCustom} maxLength={64} onSubmitEditing={() => set({ customStatus: custom }).then(closeModal)} />
      <Actions>
        <Button variant="ghost" title={t('nav.settings')} icon="settings-outline" onPress={() => openModal('settings')} />
        <Button title={t('common.save')} onPress={() => set({ customStatus: custom }).then(closeModal)} />
      </Actions>
    </Sheet>
  );
}

function ReactionPicker({ messageId }) {
  const theme = useTheme();
  const icons = useStore((s) => s.reactionIcons);
  return (
    <Sheet onClose={closeModal} width={360}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {icons.map((ic) => (
          <Pressy
            key={ic}
            pressScale={0.85}
            onPress={() => {
              api.post(`/messages/${messageId}/reactions`, { icon: ic }).catch(() => {});
              closeModal();
            }}
            style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: theme.input, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={ic} size={26} color={theme.text} />
          </Pressy>
        ))}
      </View>
    </Sheet>
  );
}

function FriendPicker({ title, sub, exclude = [], onSubmit, submitLabel, withName }) {
  const theme = useTheme();
  const t = useT();
  const friends = useStore((s) => s.friends.filter((f) => f.status === 'accepted' && !exclude.includes(f.user.id)));
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const { busy, error, run } = useAction();
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 9 ? p : [...p, id]));
  return (
    <Sheet onClose={closeModal}>
      <Title icon="people" sub={sub}>
        {title}
      </Title>
      {withName ? <Input label={t('friends.groupName')} value={name} onChangeText={setName} /> : null}
      <View style={{ gap: 2, marginHorizontal: -8 }}>
        {friends.length === 0 ? <Text style={{ color: theme.textMuted, padding: 8 }}>{t('friends.empty')}</Text> : null}
        {friends.map(({ user }) => {
          const on = picked.includes(user.id);
          return (
            <Pressy key={user.id} onPress={() => toggle(user.id)} style={{ borderRadius: 12, backgroundColor: on ? theme.accentSoft : 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                <Avatar user={user} size={34} showStatus ring={theme.panel} />
                <Text style={{ color: theme.text, flex: 1, fontWeight: '600' }}>{user.displayName}</Text>
                <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? theme.accent : theme.textFaint} />
              </View>
            </Pressy>
          );
        })}
      </View>
      <ErrorLine text={error} />
      <Actions>
        <Button variant="ghost" title={t('common.cancel')} onPress={closeModal} />
        <Button title={submitLabel} disabled={!picked.length} loading={busy} onPress={() => run(async () => { await onSubmit(picked, name); closeModal(); })} />
      </Actions>
    </Sheet>
  );
}

function RenameGroup({ dm }) {
  const t = useT();
  const [name, setName] = useState(dm.name || '');
  const { busy, error, run } = useAction();
  return (
    <Sheet onClose={closeModal}>
      <Title icon="create">{t('friends.renameGroup')}</Title>
      <Input value={name} onChangeText={setName} autoFocus={Platform.OS === 'web'} />
      <ErrorLine text={error} />
      <Actions>
        <Button variant="ghost" title={t('common.cancel')} onPress={closeModal} />
        <Button title={t('common.save')} loading={busy} onPress={() => run(async () => { await api.patch(`/dms/${dm.id}`, { name }); closeModal(); })} />
      </Actions>
    </Sheet>
  );
}

function NicknameModal({ server }) {
  const t = useT();
  const me = useStore((s) => s.me);
  const member = server.members.find((m) => m.id === me.id);
  const [name, setName] = useState(member?.nickname || '');
  const { busy, error, run } = useAction();
  return (
    <Sheet onClose={closeModal}>
      <Title icon="pricetag">Nickname</Title>
      <Input value={name} onChangeText={setName} placeholder={me.displayName} autoFocus={Platform.OS === 'web'} />
      <ErrorLine text={error} />
      <Actions>
        <Button variant="ghost" title={t('common.cancel')} onPress={closeModal} />
        <Button title={t('common.save')} loading={busy} onPress={() => run(async () => { await api.patch(`/servers/${server.id}/members/${me.id}`, { nickname: name }); closeModal(); })} />
      </Actions>
    </Sheet>
  );
}

function MembersSheet() {
  return (
    <Sheet onClose={closeModal}>
      <View style={{ marginHorizontal: -22, marginTop: -16 }}>
        <MemberList />
      </View>
    </Sheet>
  );
}

// Vollbild-Ansichten (Einstellungen) gleiten von rechts herein.
function FullScreen({ children }) {
  const theme = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    theme.motion ? Animated.timing(v, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start() : v.setValue(1);
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] });
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, opacity: v, transform: [{ scale }] }]}>{children}</Animated.View>;
}

function serverMenuItems(server, t) {
  const admin = server.myRole === 'admin' || server.myRole === 'owner';
  return [
    { icon: 'person-add-outline', label: t('server.invite'), onPress: () => openModal('invite', { server }) },
    admin && { icon: 'settings-outline', label: t('server.settings'), onPress: () => openModal('serverSettings', { serverId: server.id }) },
    admin && { icon: 'add-circle-outline', label: t('server.createChannel'), onPress: () => openModal('createChannel', { server, type: 'text' }) },
    { icon: 'pricetag-outline', label: 'Nickname', onPress: () => openModal('nickname', { server }) },
    server.myRole !== 'owner' && {
      icon: 'exit-outline',
      label: t('server.leave'),
      danger: true,
      onPress: () => openModal('confirm', { title: t('server.leave'), text: t('server.leaveConfirm', { name: server.name }), danger: true, confirmLabel: t('common.leave'), onConfirm: () => api.post(`/servers/${server.id}/leave`) }),
    },
    server.myRole === 'owner' && {
      icon: 'trash-outline',
      label: t('server.delete'),
      danger: true,
      onPress: () => openModal('confirm', { title: t('server.delete'), text: t('server.deleteConfirm', { name: server.name }), danger: true, confirmLabel: t('common.delete'), onConfirm: () => api.del(`/servers/${server.id}`) }),
    },
  ];
}

export function ModalHost() {
  const screen = useStore((s) => s.screen);

  // Escape schließt Dialoge im Browser/Desktop.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e) => e.key === 'Escape' && (getState().modal || getState().screen) && closeModal();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {screen ? (
        <FullScreen key={screen.type}>{screen.type === 'settings' ? <SettingsScreen /> : <ServerSettings serverId={screen.props.serverId} />}</FullScreen>
      ) : null}
      <DialogHost />
    </>
  );
}

function DialogHost() {
  const t = useT();
  const modal = useStore((s) => s.modal);
  const me = useStore((s) => s.me);
  if (!modal) return null;
  const p = modal.props;
  const key = `${modal.type}-${JSON.stringify(Object.keys(p))}`;
  switch (modal.type) {
    case 'confirm':
      return <ConfirmModal key={key} {...p} />;
    case 'actionMenu':
      return <ActionMenu key={key} {...p} />;
    case 'addServer':
      return <AddServerModal key={key} />;
    case 'joinServer':
      return <JoinServerModal key={key} {...p} />;
    case 'invite':
      return <InviteModal key={key} {...p} />;
    case 'createChannel':
      return <ChannelModal key={key} server={p.server} type={p.type} />;
    case 'editChannel':
      return <ChannelModal key={key} channel={p.channel} server={p.server} />;
    case 'channelMenu':
      return (
        <ActionMenu
          key={key}
          title={p.channel.name}
          items={[
            { icon: 'create-outline', label: t('server.editChannel'), onPress: () => openModal('editChannel', p) },
            {
              icon: 'trash-outline',
              label: t('server.deleteChannel'),
              danger: true,
              onPress: () => openModal('confirm', { title: t('server.deleteChannel'), text: t('server.deleteChannelConfirm', { name: p.channel.name }), danger: true, confirmLabel: t('common.delete'), onConfirm: () => api.del(`/channels/${p.channel.id}`) }),
            },
          ]}
        />
      );
    case 'serverMenu':
      return <ActionMenu key={key} title={p.server.name} items={serverMenuItems(p.server, t)} />;
    case 'profile':
      return <ProfileModal key={key + p.userId} {...p} />;
    case 'statusPicker':
      return <StatusPicker key={key} />;
    case 'reactionPicker':
      return <ReactionPicker key={key} {...p} />;
    case 'messageMenu':
      return (
        <ActionMenu
          key={key}
          items={[
            { icon: 'happy-outline', label: t('chat.react'), onPress: p.actions.react },
            { icon: 'arrow-undo-outline', label: t('chat.reply'), onPress: p.actions.reply },
            { icon: 'copy-outline', label: t('chat.copyText'), onPress: p.actions.copy },
            p.mine && { icon: 'create-outline', label: t('common.edit'), onPress: p.actions.edit },
            p.canDelete && { icon: 'trash-outline', label: t('common.delete'), danger: true, onPress: p.actions.remove },
          ]}
        />
      );
    case 'newGroup':
      return <FriendPicker key={key} title={t('nav.newGroup')} sub={t('friends.pickForGroup')} withName submitLabel={t('common.create')} onSubmit={(ids, name) => openDm(ids, { name, group: true })} />;
    case 'groupMenu':
      return (
        <ActionMenu
          key={key}
          title={p.dm.name || t('nav.newGroup')}
          items={[
            { icon: 'person-add-outline', label: t('friends.addToGroup'), onPress: () => openModal('addToGroup', p) },
            { icon: 'create-outline', label: t('friends.renameGroup'), onPress: () => openModal('renameGroup', p) },
            { icon: 'exit-outline', label: t('friends.leaveGroup'), danger: true, onPress: () => api.del(`/dms/${p.dm.id}/members/${me.id}`) },
          ]}
        />
      );
    case 'addToGroup':
      return <FriendPicker key={key} title={t('friends.addToGroup')} exclude={p.dm.members.map((m) => m.id)} submitLabel={t('common.add')} onSubmit={(ids) => api.post(`/dms/${p.dm.id}/members`, { userIds: ids })} />;
    case 'renameGroup':
      return <RenameGroup key={key} {...p} />;
    case 'nickname':
      return <NicknameModal key={key} {...p} />;
    case 'members':
      return <MembersSheet key={key} />;
    default:
      return null;
  }
}

export function ToastHost() {
  const theme = useTheme();
  const toast = useStore((s) => s.toast);
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (toast) {
      setShown(toast);
      Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 16, bounciness: 8 }).start();
    } else Animated.timing(v, { toValue: 0, duration: 180, useNativeDriver: NATIVE }).start(() => setShown(null));
  }, [toast]);
  if (!shown) return null;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });
  const color = shown.kind === 'error' ? theme.danger : theme.accent;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 40, left: 0, right: 0, alignItems: 'center', opacity: v, transform: [{ translateY }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.elevated, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, maxWidth: '90%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16 }}>
        <Icon name={shown.kind === 'error' ? 'alert-circle' : 'checkmark-circle'} size={18} color={color} />
        <Text style={{ color: theme.text, fontWeight: '600', flexShrink: 1 }}>{shown.text}</Text>
      </View>
    </Animated.View>
  );
}

export function IncomingCall() {
  const theme = useTheme();
  const t = useT();
  const call = useStore((s) => s.incomingCall);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!call) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: NATIVE }),
        Animated.timing(v, { toValue: 0, duration: 700, useNativeDriver: NATIVE }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [call]);
  if (!call) return null;
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const dismiss = () => setState({ incomingCall: null });
  return (
    <FadeIn style={{ position: 'absolute', top: 20, right: 20, left: Platform.OS === 'web' ? undefined : 20, zIndex: 50 }}>
      <View style={{ backgroundColor: theme.elevated, borderRadius: 22, padding: 18, gap: 14, minWidth: 280, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Avatar user={call.caller} size={52} />
          </Animated.View>
          <View>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t('voice.incomingCall')}</Text>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{call.caller.displayName}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            variant="danger"
            icon="close"
            title={t('voice.decline')}
            style={{ flex: 1 }}
            onPress={() => {
              require('../api').getSocket()?.emit('call:decline', { dmId: call.dmId });
              dismiss();
            }}
          />
          <Button
            variant="success"
            icon="call"
            title={t('voice.accept')}
            style={{ flex: 1 }}
            onPress={() => {
              dismiss();
              navigate({ section: 'home', homeTab: 'dm', dmId: call.dmId });
              voice.join(call.dmId);
            }}
          />
        </View>
      </View>
    </FadeIn>
  );
}

export { IconButton };
