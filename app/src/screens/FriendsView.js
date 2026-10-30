import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../theme';
import { useT, errorText } from '../i18n';
import { useStore, openModal, showToast } from '../store';
import { api, openDm } from '../api';
import { Avatar, IconButton, Input, Button, Segmented, EmptyState, FadeIn, Pressy, Card } from '../ui';
import { voice } from '../voice/engine';
import Header from './Header';

function FriendRow({ entry }) {
  const theme = useTheme();
  const t = useT();
  const { user, status, direction } = entry;
  const statusText =
    status === 'pending' ? (direction === 'incoming' ? t('friends.incoming') : t('friends.outgoing')) : status === 'blocked' ? t('friends.blocked') : user.customStatus || t(`settings.status${user.status[0].toUpperCase()}${user.status.slice(1)}`);
  const act = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      showToast(errorText(t, e), 'error');
    }
  };
  return (
    <Pressy onPress={() => openModal('profile', { userId: user.id })} style={{ borderRadius: 14, marginHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
        <Avatar user={user} size={40} showStatus={status === 'accepted'} ring={theme.bg} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: theme.fs(15) }}>{user.displayName}</Text>
            <Text style={{ color: theme.textFaint, fontSize: theme.fs(12.5) }}>@{user.username}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: theme.fs(12.5) }}>{statusText}</Text>
        </View>
        {status === 'accepted' ? (
          <>
            <IconButton icon="chatbubble" filled onPress={act(() => openDm([user.id]))} label={t('friends.message')} />
            <IconButton
              icon="call"
              filled
              onPress={act(async () => {
                const dm = await openDm([user.id]);
                voice.join(dm.id);
              })}
              label={t('friends.call')}
            />
            <IconButton
              icon="ellipsis-vertical"
              filled
              onPress={() =>
                openModal('actionMenu', {
                  title: user.displayName,
                  items: [
                    { icon: 'person-remove', label: t('friends.remove'), danger: true, onPress: () => openModal('confirm', { title: t('friends.remove'), text: t('friends.removeConfirm', { name: user.displayName }), danger: true, onConfirm: () => api.del(`/friends/${user.id}`) }) },
                    { icon: 'ban', label: t('friends.block'), danger: true, onPress: () => api.post(`/friends/${user.id}/block`) },
                  ],
                })
              }
            />
          </>
        ) : status === 'pending' && direction === 'incoming' ? (
          <>
            <IconButton icon="checkmark" color={theme.success} filled onPress={act(() => api.post(`/friends/${user.id}/accept`))} label={t('friends.accept')} />
            <IconButton icon="close" color={theme.danger} filled onPress={act(() => api.del(`/friends/${user.id}`))} label={t('friends.decline')} />
          </>
        ) : status === 'pending' ? (
          <IconButton icon="close" filled onPress={act(() => api.del(`/friends/${user.id}`))} label={t('friends.cancel')} />
        ) : (
          <Button small variant="secondary" title={t('friends.unblock')} onPress={act(() => api.del(`/friends/${user.id}`))} />
        )}
      </View>
    </Pressy>
  );
}

function AddFriend() {
  const theme = useTheme();
  const t = useT();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.post('/friends', { username: name.trim().replace(/^@/, '') });
      setMsg({ ok: true, text: t('friends.requestSent') });
      setName('');
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <FadeIn style={{ padding: 20, gap: 12 }}>
      <Text style={{ color: theme.text, fontSize: theme.fs(18), fontWeight: '800' }}>{t('friends.add')}</Text>
      <Text style={{ color: theme.textMuted }}>{t('friends.addSub')}</Text>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Input style={{ flex: 1 }} value={name} onChangeText={setName} placeholder={t('friends.addPlaceholder')} icon="at" autoCapitalize="none" autoCorrect={false} onSubmitEditing={send} />
        <Button title={t('friends.sendRequest')} onPress={send} loading={busy} disabled={!name.trim()} />
      </View>
      {msg ? <Text style={{ color: msg.ok ? theme.success : theme.danger }}>{msg.text}</Text> : null}
    </FadeIn>
  );
}

export default function FriendsView({ onBack }) {
  const theme = useTheme();
  const t = useT();
  const friends = useStore((s) => s.friends);
  const [tab, setTab] = useState('online');
  const pendingCount = friends.filter((f) => f.status === 'pending' && f.direction === 'incoming').length;
  const list = friends.filter((f) =>
    tab === 'online' ? f.status === 'accepted' && f.user.status !== 'offline' : tab === 'all' ? f.status === 'accepted' : tab === 'pending' ? f.status === 'pending' : tab === 'blocked' ? f.status === 'blocked' && f.direction === 'outgoing' : false
  );
  return (
    <View style={{ flex: 1 }}>
      <Header icon="people" title={t('friends.title')} onBack={onBack} right={<IconButton icon="person-add" active={tab === 'add'} onPress={() => setTab('add')} label={t('friends.add')} />} />
      <View style={{ padding: 12 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'online', label: t('friends.online') },
            { value: 'all', label: t('friends.all') },
            { value: 'pending', label: pendingCount ? `${t('friends.pending')} (${pendingCount})` : t('friends.pending') },
            { value: 'blocked', label: t('friends.blocked') },
            { value: 'add', label: t('friends.add'), icon: 'add' },
          ]}
        />
      </View>
      {tab === 'add' ? (
        <AddFriend />
      ) : list.length ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <FadeIn deps={[tab]}>
            {list.map((f) => (
              <FriendRow key={f.user.id} entry={f} />
            ))}
          </FadeIn>
        </ScrollView>
      ) : (
        <EmptyState icon={tab === 'online' ? 'moon-outline' : 'people-outline'} title={tab === 'online' ? t('friends.emptyOnline') : t('friends.empty')} />
      )}
    </View>
  );
}
