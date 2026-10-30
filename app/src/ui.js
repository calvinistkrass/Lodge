import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, onColor, STATUS_COLORS } from './theme';

const NATIVE = Platform.OS !== 'web';
const OUTER_KEYS = new Set(['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom', 'zIndex']);

export const Icon = ({ name, size = 20, color, style }) => <Ionicons name={name} size={size} color={color} style={style} />;

export function useIsMobile() {
  const { width } = useWindowDimensions();
  return width < 820;
}

function useSpring(initial = 0) {
  return useRef(new Animated.Value(initial)).current;
}

// Grundbaustein für alle Buttons: federndes Drücken und weiches Hover-Licht.
export function Pressy({ onPress, onLongPress, disabled, style, children, hoverColor, pressScale = 0.965, radius, contentStyle, accessibilityLabel, onHoverChange, delayLongPress }) {
  const theme = useTheme();
  const press = useSpring(0);
  const hover = useSpring(0);
  const animate = (v, to, fast) =>
    theme.motion
      ? Animated.spring(v, { toValue: to, useNativeDriver: NATIVE, speed: fast ? 40 : 22, bounciness: fast ? 0 : 6 }).start()
      : v.setValue(to);
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, pressScale] });
  const flat = StyleSheet.flatten(style) || {};
  const borderRadius = radius ?? flat.borderRadius ?? 10;
  // Layout-Eigenschaften gehören an das äußere Pressable, sonst greifen flex/margin nicht.
  const outer = {};
  const inner = {};
  for (const [k, v] of Object.entries(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = v;
  if (outer.flex || outer.flexGrow) inner.flexGrow = 1;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      delayLongPress={delayLongPress ?? 380}
      onPressIn={() => !disabled && animate(press, 1, true)}
      onPressOut={() => animate(press, 0)}
      onHoverIn={() => {
        if (disabled) return;
        animate(hover, 1, true);
        onHoverChange?.(true);
      }}
      onHoverOut={() => {
        animate(hover, 0, true);
        onHoverChange?.(false);
      }}
      // Im Web wäre "button" ein <button>, und Buttons dürfen nicht ineinander stecken.
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={accessibilityLabel}
      style={[outer, Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer', outlineStyle: 'none' }]}
    >
      <Animated.View style={[inner, { transform: [{ scale }], opacity: disabled ? 0.5 : 1, overflow: 'hidden' }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hoverColor || theme.hover, opacity: hover, borderRadius }]} />
        {contentStyle ? <View style={contentStyle}>{children}</View> : children}
      </Animated.View>
    </Pressable>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style, full }) {
  const theme = useTheme();
  const bg = {
    primary: theme.accent,
    secondary: theme.elevated,
    danger: theme.danger,
    ghost: 'transparent',
    success: theme.success,
  }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? theme.text : onColor(bg);
  return (
    <Pressy
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      hoverColor={variant === 'secondary' || variant === 'ghost' ? theme.hover : 'rgba(255,255,255,0.14)'}
      style={[
        {
          backgroundColor: bg,
          borderRadius: 12,
          paddingHorizontal: small ? 12 : 18,
          height: small ? 34 : 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: full ? 'stretch' : 'flex-start',
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
          {title ? <Text style={{ color: fg, fontWeight: '600', fontSize: theme.fs(small ? 13 : 15) }}>{title}</Text> : null}
        </View>
      )}
    </Pressy>
  );
}

export function IconButton({ icon, onPress, size = 20, color, active, activeColor, danger, label, style, box = 36, filled, badge }) {
  const theme = useTheme();
  const fg = danger ? '#fff' : active ? activeColor || theme.accent : color || theme.textMuted;
  return (
    <Pressy
      onPress={onPress}
      accessibilityLabel={label}
      radius={box / 2.6}
      style={[
        {
          width: box,
          height: box,
          borderRadius: box / 2.6,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: danger ? theme.danger : filled ? theme.elevated : active ? (activeColor || theme.accent) + '22' : 'transparent',
        },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={fg} />
      {badge ? (
        <View style={{ position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{badge}</Text>
        </View>
      ) : null}
    </Pressy>
  );
}

export const Input = React.forwardRef(function Input({ label, hint, style, inputStyle, multiline, icon, error, ...props }, ref) {
  const theme = useTheme();
  const focus = useSpring(0);
  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [theme.border, theme.accent] });
  const anim = (to) => (theme.motion ? Animated.timing(focus, { toValue: to, duration: 160, useNativeDriver: false }).start() : focus.setValue(to));
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={{ color: theme.textMuted, fontSize: theme.fs(12), fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text> : null}
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.input, borderRadius: 12, borderWidth: 1.5, borderColor: error ? theme.danger : borderColor, paddingHorizontal: 12 }}>
        {icon ? <Icon name={icon} size={18} color={theme.textFaint} style={{ marginRight: 8 }} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.textFaint}
          multiline={multiline}
          onFocus={(e) => {
            anim(1);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            anim(0);
            props.onBlur?.(e);
          }}
          {...props}
          style={[
            { flex: 1, color: theme.text, fontSize: theme.fs(15), paddingVertical: multiline ? 10 : 0, height: multiline ? undefined : 44, minHeight: multiline ? 80 : undefined, textAlignVertical: multiline ? 'top' : 'center' },
            Platform.OS === 'web' && { outlineStyle: 'none' },
            inputStyle,
          ]}
        />
      </Animated.View>
      {error ? <Text style={{ color: theme.danger, fontSize: theme.fs(12) }}>{error}</Text> : hint ? <Text style={{ color: theme.textFaint, fontSize: theme.fs(12) }}>{hint}</Text> : null}
    </View>
  );
});

export function initials(name = '?') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function Avatar({ user, size = 36, showStatus, ring, speaking }) {
  const theme = useTheme();
  const color = user?.avatarColor || '#7c5cff';
  const fg = onColor(color);
  const status = user?.status || 'offline';
  const pulse = useSpring(0);
  useEffect(() => {
    Animated.timing(pulse, { toValue: speaking ? 1 : 0, duration: 140, useNativeDriver: false }).start();
  }, [speaking]);
  const borderColor = pulse.interpolate({ inputRange: [0, 1], outputRange: ['transparent', theme.success] });
  return (
    <Animated.View style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, borderWidth: 2.5, borderColor, alignItems: 'center', justifyContent: 'center', margin: -3 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        {user?.avatarIcon ? (
          <Icon name={user.avatarIcon} size={size * 0.52} color={fg} />
        ) : (
          <Text style={{ color: fg, fontWeight: '700', fontSize: size * 0.38 }}>{initials(user?.displayName || user?.username)}</Text>
        )}
        {showStatus ? (
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: size * 0.36,
              height: size * 0.36,
              borderRadius: size,
              backgroundColor: STATUS_COLORS[status],
              borderWidth: Math.max(2, size * 0.08),
              borderColor: ring || theme.sidebar,
            }}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

export function StatusDot({ status, size = 10 }) {
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: STATUS_COLORS[status || 'offline'] }} />;
}

export function Toggle({ value, onChange }) {
  const theme = useTheme();
  const v = useSpring(value ? 1 : 0);
  useEffect(() => {
    theme.motion ? Animated.spring(v, { toValue: value ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 8 }).start() : v.setValue(value ? 1 : 0);
  }, [value]);
  const bg = v.interpolate({ inputRange: [0, 1], outputRange: [theme.input, theme.accent] });
  const x = v.interpolate({ inputRange: [0, 1], outputRange: [3, 23] });
  return (
    <Pressable onPress={() => onChange(!value)} style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Animated.View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: bg, justifyContent: 'center' }}>
        <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', transform: [{ translateX: x }], shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />
      </Animated.View>
    </Pressable>
  );
}

export function Segmented({ options, value, onChange }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.input, borderRadius: 12, padding: 4, gap: 4, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressy key={String(o.value)} onPress={() => onChange(o.value)} style={{ flexGrow: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9, backgroundColor: active ? theme.elevated : 'transparent', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {o.icon ? <Icon name={o.icon} size={16} color={active ? theme.text : theme.textMuted} /> : null}
              <Text style={{ color: active ? theme.text : theme.textMuted, fontWeight: '600', fontSize: theme.fs(13) }}>{o.label}</Text>
            </View>
          </Pressy>
        );
      })}
    </View>
  );
}

export function SettingRow({ title, subtitle, children, onPress, icon, danger }) {
  const theme = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
      {icon ? <Icon name={icon} size={20} color={danger ? theme.danger : theme.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? theme.danger : theme.text, fontSize: theme.fs(15), fontWeight: '500' }}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.textFaint, fontSize: theme.fs(12.5), marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {children}
      {onPress && !children ? <Icon name="chevron-forward" size={18} color={theme.textFaint} /> : null}
    </View>
  );
  return onPress ? (
    <Pressy onPress={onPress} radius={12} style={{ borderRadius: 12 }}>
      {content}
    </Pressy>
  ) : (
    content
  );
}

export function Card({ children, style, title }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={{ color: theme.textMuted, fontSize: theme.fs(12), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginLeft: 4 }}>{title}</Text> : null}
      <View style={[{ backgroundColor: theme.panel, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, overflow: 'hidden' }, style]}>{children}</View>
    </View>
  );
}

export function Divider({ inset = 0 }) {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: inset }} />;
}

// Weiches Einblenden für Ansichten.
export function FadeIn({ children, style, deps = [], from = 8 }) {
  const theme = useTheme();
  const v = useSpring(theme.motion ? 0 : 1);
  useEffect(() => {
    if (!theme.motion) return v.setValue(1);
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, deps);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  return <Animated.View style={[{ opacity: v, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

export function Swatches({ colors, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {colors.map((c) => (
        <Pressy key={c} onPress={() => onChange(c)} radius={18} pressScale={0.88} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: value === c ? 3 : 0, borderColor: '#ffffffcc' }}>
          {value === c ? <Icon name="checkmark" size={18} color={onColor(c)} /> : null}
        </Pressy>
      ))}
    </View>
  );
}

export function IconPicker({ icons, value, onChange, color }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {icons.map((ic) => {
        const active = value === ic;
        return (
          <Pressy key={ic || 'none'} onPress={() => onChange(ic)} radius={12} pressScale={0.9} style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? color || theme.accent : theme.input }}>
            {ic ? <Icon name={ic} size={22} color={active ? onColor(color || theme.accent) : theme.textMuted} /> : <Text style={{ color: active ? '#fff' : theme.textMuted, fontWeight: '700' }}>Aa</Text>}
          </Pressy>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon, title, subtitle }) {
  const theme = useTheme();
  return (
    <FadeIn style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
      <View style={{ width: 84, height: 84, borderRadius: 28, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={40} color={theme.accent} />
      </View>
      <Text style={{ color: theme.text, fontSize: theme.fs(17), fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {subtitle ? <Text style={{ color: theme.textMuted, fontSize: theme.fs(14), textAlign: 'center', maxWidth: 360 }}>{subtitle}</Text> : null}
    </FadeIn>
  );
}

export function useHover() {
  const [hovered, setHovered] = useState(false);
  return [hovered, { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }];
}
