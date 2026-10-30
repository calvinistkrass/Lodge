import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../theme';
import { useT } from '../i18n';
import { useStore, openModal } from '../store';
import { Avatar, Pressy, Icon } from '../ui';

const ROLE_ICON = { owner: 'ribbon', admin: 'shield-checkmark' };

function MemberRow({ user, role, serverId }) {
  const theme = useTheme();
  const offline = user.status === 'offline';
  return (
    <Pressy onPress={() => openModal('profile', { userId: user.id, serverId })} style={{ marginHorizontal: 8, borderRadius: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6, opacity: offline ? 0.45 : 1 }}>
        <Avatar user={user} size={34} showStatus={!offline} ring={theme.sidebar} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '600', fontSize: theme.fs(14), flexShrink: 1 }}>
              {user.nickname || user.displayName}
            </Text>
            {ROLE_ICON[role] ? <Icon name={ROLE_ICON[role]} size={13} color={role === 'owner' ? '#f5b400' : theme.accent} /> : null}
          </View>
          {user.customStatus ? (
            <Text numberOfLines={1} style={{ color: theme.textFaint, fontSize: theme.fs(12) }}>
              {user.customStatus}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressy>
  );
}

export function MemberList() {
  const theme = useTheme();
  const t = useT();
  const server = useStore((s) => (s.nav.section === 'server' ? s.servers.find((x) => x.id === s.nav.serverId) : null));
  const dm = useStore((s) => (s.nav.section === 'home' ? s.dms.find((x) => x.id === s.nav.dmId) : null));
  const members = server ? server.members : dm ? dm.members.map((m) => ({ ...m, role: m.id === dm.ownerId ? 'owner' : 'member' })) : [];
  const online = members.filter((m) => m.status !== 'offline');
  const offline = members.filter((m) => m.status === 'offline');
  const rank = { owner: 0, admin: 1, member: 2 };
  const sort = (a, b) => rank[a.role] - rank[b.role] || (a.nickname || a.displayName).localeCompare(b.nickname || b.displayName);
  const Title = ({ children }) => (
    <Text style={{ color: theme.textFaint, fontSize: theme.fs(11.5), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 18, marginTop: 16, marginBottom: 4 }}>{children}</Text>
  );
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
      {online.length ? <Title>{`${t('nav.online')} — ${online.length}`}</Title> : null}
      {online.sort(sort).map((m) => (
        <MemberRow key={m.id} user={m} role={m.role} serverId={server?.id} />
      ))}
      {offline.length ? <Title>{`${t('nav.offline')} — ${offline.length}`}</Title> : null}
      {offline.sort(sort).map((m) => (
        <MemberRow key={m.id} user={m} role={m.role} serverId={server?.id} />
      ))}
    </ScrollView>
  );
}
