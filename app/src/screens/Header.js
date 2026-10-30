import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { Icon, IconButton } from '../ui';

export default function Header({ icon, iconNode, title, subtitle, onBack, right }) {
  const theme = useTheme();
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border, backgroundColor: theme.bg }}>
      {onBack ? <IconButton icon="arrow-back" onPress={onBack} /> : null}
      {iconNode || (icon ? <Icon name={icon} size={22} color={theme.textFaint} /> : null)}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: theme.fs(16), flexShrink: 0, maxWidth: '60%' }}>
          {title}
        </Text>
        {subtitle ? (
          <>
            <View style={{ width: 1, height: 18, backgroundColor: theme.border }} />
            <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: theme.fs(13), flex: 1 }}>
              {subtitle}
            </Text>
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{right}</View>
    </View>
  );
}
