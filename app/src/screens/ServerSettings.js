import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../theme';
import { useT, errorText } from '../i18n';
import { useStore, closeModal, openModal, showToast } from '../store';
import { api } from '../api';
import { Button, Input, Icon, IconButton, Avatar, Pressy, Swatches, IconPicker, Segmented, SettingRow, Card, Divider, useIsMobile, FadeIn } from '../ui';
import { inviteLink, formatStamp } from '../util';

function Overview({ server }) {
  const theme = useTheme();
  const t = useT();
  const icons = useStore((s) => s.serverIcons);
  const colors = useStore((s) => s.colors);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [icon, setIcon] = useState(server.icon);
  const [color, setColor] = useState(server.color);
  const [busy, setBusy] = useState(false);
  const dirty = name !== server.name || description !== (server.description || '') || icon !== server.icon || color !== server.color;
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/servers/${server.id}`, { name, description, icon, color });
      showToast(t('common.saved'));
    } catch (e) {
      showToast(errorText(t, e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card style={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={40} color="#fff" />
          </View>
          <Input style={{ flex: 1 }} label={t('server.name')} value={name} onChangeText={setName} maxLength={50} />
        </View>
        <Input label={t('server.description')} value={description} onChangeText={setDescription} multiline maxLength={300} />
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('server.icon')}</Text>
        <IconPicker icons={icons} value={icon} onChange={setIcon} color={color} />
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('server.color')}</Text>
        <Swatches colors={colors} value={color} onChange={setColor} />
        <Button title={t('common.save')} loading={busy} disabled={!dirty || !name.trim()} onPress={save} />
      </Card>
      <Card title={t('server.danger')}>
        {server.myRole === 'owner' ? (
          <SettingRow
            icon="trash-outline"
            danger
            title={t('server.delete')}
            onPress={() =>
              openModal('confirm', {
                title: t('server.delete'),
                text: t('server.deleteConfirm', { name: server.name }),
                danger: true,
                confirmLabel: t('common.delete'),
                onConfirm: () => api.del(`/servers/${server.id}`),
              })
            }
          />
        ) : (
          <SettingRow
            icon="exit-outline"
            danger
            title={t('server.leave')}
            onPress={() =>
              openModal('confirm', {
                title: t('server.leave'),
                text: t('server.leaveConfirm', { name: server.name }),
                danger: true,
                confirmLabel: t('common.leave'),
                onConfirm: () => api.post(`/servers/${server.id}/leave`),
              })
            }
          />
        )}
      </Card>
    </>
  );
}

function Channels({ server }) {
  const theme = useTheme();
  const t = useT();
  const groups = [
    ['text', t('nav.textChannels'), 'chatbubble-ellipses-outline'],
    ['voice', t('nav.voiceChannels'), 'volume-high-outline'],
  ];
  return groups.map(([type, title, icon]) => (
    <Card key={type} title={title}>
      {server.channels
        .filter((c) => c.type === type)
        .map((c, i) => (
          <View key={c.id}>
            {i ? <Divider inset={46} /> : null}
            <SettingRow icon={icon} title={c.name} subtitle={c.topic || null}>
              <View style={{ flexDirection: 'row' }}>
                <IconButton icon="create-outline" onPress={() => openModal('editChannel', { channel: c, server })} label={t('common.edit')} />
                <IconButton
                  icon="trash-outline"
                  color={theme.danger}
                  onPress={() =>
                    openModal('confirm', {
                      title: t('server.deleteChannel'),
                      text: t('server.deleteChannelConfirm', { name: c.name }),
                      danger: true,
                      confirmLabel: t('common.delete'),
                      onConfirm: () => api.del(`/channels/${c.id}`),
                    })
                  }
                  label={t('common.delete')}
                />
              </View>
            </SettingRow>
          </View>
        ))}
      <Divider />
      <SettingRow icon="add-circle-outline" title={t('server.createChannel')} onPress={() => openModal('createChannel', { server, type })} />
    </Card>
  ));
}

function Members({ server }) {
  const theme = useTheme();
  const t = useT();
  const rank = { owner: 0, admin: 1, member: 2 };
  const members = [...server.members].sort((a, b) => rank[a.role] - rank[b.role]);
  return (
    <Card title={t('server.memberCount', { n: members.length })}>
      {members.map((m, i) => (
        <View key={m.id}>
          {i ? <Divider inset={60} /> : null}
          <Pressy onPress={() => openModal('profile', { userId: m.id, serverId: server.id })} radius={0}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <Avatar user={m} size={36} showStatus ring={theme.panel} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>{m.nickname || m.displayName}</Text>
                <Text style={{ color: theme.textFaint, fontSize: 12 }}>@{m.username}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.input, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                <Icon name={m.role === 'owner' ? 'ribbon' : m.role === 'admin' ? 'shield-checkmark' : 'person'} size={13} color={m.role === 'owner' ? '#f5b400' : theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>{t(`server.${m.role}`)}</Text>
              </View>
            </View>
          </Pressy>
        </View>
      ))}
    </Card>
  );
}

function Invites({ server }) {
  const theme = useTheme();
  const t = useT();
  const [list, setList] = useState(null);
  const load = () => api.get(`/servers/${server.id}/invites`).then(setList, () => setList([]));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Button icon="person-add" title={t('server.invite')} onPress={() => openModal('invite', { server })} />
      <Card title={t('server.invitesTab')}>
        {list === null ? <Text style={{ color: theme.textMuted, padding: 14 }}>{t('common.loading')}</Text> : null}
        {list?.length === 0 ? <Text style={{ color: theme.textMuted, padding: 14 }}>—</Text> : null}
        {list?.map((inv, i) => (
          <View key={inv.code}>
            {i ? <Divider inset={14} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontFamily: 'monospace' }}>{inv.code}</Text>
                <Text style={{ color: theme.textFaint, fontSize: 12 }}>
                  {inv.creator?.displayName} · {t('server.uses', { n: inv.maxUses ? `${inv.uses}/${inv.maxUses}` : inv.uses })} · {inv.expiresAt ? formatStamp(inv.expiresAt, t) : t('server.never')}
                </Text>
              </View>
              <IconButton
                icon="copy-outline"
                onPress={async () => {
                  await Clipboard.setStringAsync(inviteLink(inv.code));
                  showToast(t('common.copied'));
                }}
              />
              <IconButton icon="trash-outline" color={theme.danger} onPress={() => api.del(`/invites/${inv.code}`).then(load)} />
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

const TABS = [
  { key: 'overview', icon: 'information-circle-outline', C: Overview },
  { key: 'channels', icon: 'list-outline', C: Channels },
  { key: 'membersTab', icon: 'people-outline', C: Members },
  { key: 'invitesTab', icon: 'link-outline', C: Invites },
];

export default function ServerSettings({ serverId }) {
  const theme = useTheme();
  const t = useT();
  const mobile = useIsMobile();
  const server = useStore((s) => s.servers.find((x) => x.id === serverId));
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    if (!server) closeModal();
  }, [server]);
  if (!server) return null;
  const Section = TABS.find((x) => x.key === tab).C;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: mobile ? 12 : 40 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: server.color, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={server.icon} size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }} numberOfLines={1}>
            {server.name}
          </Text>
          <Text style={{ color: theme.textFaint, fontSize: 12 }}>{t('server.settings')}</Text>
        </View>
        <IconButton icon="close" box={40} filled onPress={closeModal} label={t('common.close')} />
      </View>
      <View style={{ paddingHorizontal: mobile ? 12 : 40 }}>
        <Segmented value={tab} onChange={setTab} options={TABS.map((x) => ({ value: x.key, label: t(`server.${x.key}`), icon: mobile ? undefined : x.icon }))} />
      </View>
      <ScrollView contentContainerStyle={{ padding: mobile ? 12 : 40, gap: 18, maxWidth: 760, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <FadeIn deps={[tab]} style={{ gap: 18 }}>
          <Section server={server} />
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
