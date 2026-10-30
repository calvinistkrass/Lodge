import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTheme, ACCENTS } from '../theme';
import { useT, errorText, LANGUAGES, systemLanguage } from '../i18n';
import { useStore, updateSettings, closeModal, openModal, showToast, setState } from '../store';
import { api, logout, checkServer, normalizeUrl } from '../api';
import { Button, Input, Icon, IconButton, Avatar, Pressy, Swatches, IconPicker, Segmented, Toggle, SettingRow, Card, Divider, useIsMobile, FadeIn } from '../ui';
import { voice } from '../voice/engine';
import { playSound } from '../sounds';

const AVATAR_ICONS = [null, 'game-controller', 'rocket', 'flame', 'skull', 'planet', 'paw', 'leaf', 'moon', 'flash', 'headset', 'musical-notes', 'diamond', 'bug', 'fish', 'football'];
const LANGUAGE_NAMES = { de: 'Deutsch', en: 'English' };

function SectionTitle({ children }) {
  const theme = useTheme();
  return <Text style={{ color: theme.text, fontSize: theme.fs(22), fontWeight: '800', marginBottom: 4 }}>{children}</Text>;
}

function useSaver() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const run = async (fn, okText) => {
    setBusy(true);
    try {
      await fn();
      showToast(okText || t('common.saved'));
      return true;
    } catch (e) {
      showToast(errorText(t, e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

// ---------- Mein Konto ----------

function AccountSection() {
  const theme = useTheme();
  const t = useT();
  const me = useStore((s) => s.me);
  const [busy, run] = useSaver();
  const [username, setUsername] = useState(me.username);
  const [unPw, setUnPw] = useState('');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');

  const deleteAccount = () =>
    openModal('confirm', {
      title: t('settings.deleteAccount'),
      text: `${t('settings.deleteAccountSub')}\n\n${t('settings.deleteAccountConfirm')}`,
      danger: true,
      password: true,
      confirmLabel: t('settings.deleteAccount'),
      onConfirm: async (password) => {
        await api.del('/me', { password });
        logout();
      },
    });

  return (
    <>
      <SectionTitle>{t('settings.account')}</SectionTitle>
      <Card>
        <View style={{ height: 70, backgroundColor: me.avatarColor }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginTop: -40 }}>
          <View style={{ borderWidth: 5, borderColor: theme.panel, borderRadius: 50 }}>
            <Avatar user={me} size={72} showStatus ring={theme.panel} />
          </View>
          <View style={{ marginTop: 30, flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: theme.fs(20), fontWeight: '800' }}>{me.displayName}</Text>
            <Text style={{ color: theme.textMuted }}>@{me.username}</Text>
          </View>
        </View>
      </Card>

      <Card title={t('settings.changeUsername')} style={{ padding: 16, gap: 12 }}>
        <Input label={t('settings.username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} icon="at" />
        <Input label={t('common.password')} value={unPw} onChangeText={setUnPw} secureTextEntry />
        <Button
          title={t('common.save')}
          loading={busy}
          disabled={!unPw || username === me.username}
          onPress={() =>
            run(async () => {
              await api.post('/me/username', { username, password: unPw });
              setUnPw('');
            })
          }
        />
      </Card>

      <Card title={t('settings.changePassword')} style={{ padding: 16, gap: 12 }}>
        <Input label={t('settings.oldPassword')} value={oldPw} onChangeText={setOldPw} secureTextEntry />
        <Input label={t('settings.newPassword')} value={newPw} onChangeText={setNewPw} secureTextEntry />
        <Button
          title={t('settings.changePassword')}
          loading={busy}
          disabled={!oldPw || newPw.length < 6}
          onPress={() =>
            run(async () => {
              await api.post('/me/password', { oldPassword: oldPw, newPassword: newPw });
              setOldPw('');
              setNewPw('');
            }, t('settings.passwordChanged'))
          }
        />
      </Card>

      <Card title={t('settings.accountManagement')}>
        <SettingRow icon="pause-circle-outline" title={t('settings.disableAccount')} subtitle={t('settings.disableUnavailable')}>
          <View style={{ opacity: 0.4 }}>
            <Icon name="lock-closed" size={18} color={theme.textFaint} />
          </View>
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="trash-outline" danger title={t('settings.deleteAccount')} subtitle={t('settings.deleteAccountSub')} onPress={deleteAccount} />
      </Card>
    </>
  );
}

// ---------- Profil ----------

function ProfileSection() {
  const theme = useTheme();
  const t = useT();
  const me = useStore((s) => s.me);
  const colors = useStore((s) => s.colors);
  const [busy, run] = useSaver();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [about, setAbout] = useState(me.about || '');
  const [customStatus, setCustomStatus] = useState(me.customStatus || '');
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [avatarIcon, setAvatarIcon] = useState(me.avatarIcon || null);
  const preview = { ...me, displayName, avatarColor, avatarIcon };
  const dirty = displayName !== me.displayName || about !== (me.about || '') || customStatus !== (me.customStatus || '') || avatarColor !== me.avatarColor || avatarIcon !== (me.avatarIcon || null);

  return (
    <>
      <SectionTitle>{t('settings.profile')}</SectionTitle>
      <Card style={{ padding: 16, alignItems: 'center', gap: 10 }}>
        <Avatar user={preview} size={88} />
        <Text style={{ color: theme.text, fontSize: theme.fs(18), fontWeight: '800' }}>{displayName || '…'}</Text>
        {customStatus ? <Text style={{ color: theme.textMuted }}>{customStatus}</Text> : null}
      </Card>
      <Card style={{ padding: 16, gap: 14 }}>
        <Input label={t('settings.displayName')} value={displayName} onChangeText={setDisplayName} maxLength={32} />
        <Input label={t('settings.customStatus')} value={customStatus} onChangeText={setCustomStatus} maxLength={64} />
        <Input label={t('settings.aboutMe')} value={about} onChangeText={setAbout} multiline maxLength={190} hint={`${about.length}/190`} />
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('settings.avatarColor')}</Text>
        <Swatches colors={colors.length ? colors : ACCENTS} value={avatarColor} onChange={setAvatarColor} />
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('settings.avatarIcon')}</Text>
        <IconPicker icons={AVATAR_ICONS} value={avatarIcon} onChange={setAvatarIcon} color={avatarColor} />
        <Button title={t('common.save')} loading={busy} disabled={!dirty || !displayName.trim()} onPress={() => run(() => api.patch('/me', { displayName, about, customStatus, avatarColor, avatarIcon }))} />
      </Card>
    </>
  );
}

// ---------- Darstellung ----------

function AppearanceSection() {
  const theme = useTheme();
  const t = useT();
  const s = useStore((x) => x.settings);
  return (
    <>
      <SectionTitle>{t('settings.appearance')}</SectionTitle>
      <Card title={t('settings.theme')} style={{ padding: 12 }}>
        <Segmented
          value={s.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: 'dark', label: t('settings.themeDark'), icon: 'moon' },
            { value: 'midnight', label: t('settings.themeMidnight'), icon: 'contrast' },
            { value: 'light', label: t('settings.themeLight'), icon: 'sunny' },
            { value: 'system', label: t('settings.themeSystem'), icon: 'phone-portrait-outline' },
          ]}
        />
      </Card>
      <Card title={t('settings.accent')} style={{ padding: 16 }}>
        <Swatches colors={ACCENTS} value={s.accent} onChange={(accent) => updateSettings({ accent })} />
      </Card>
      <Card title={t('settings.fontScale')} style={{ padding: 12 }}>
        <Segmented
          value={s.fontScale}
          onChange={(fontScale) => updateSettings({ fontScale })}
          options={[
            { value: 0.9, label: 'S' },
            { value: 1, label: 'M' },
            { value: 1.1, label: 'L' },
            { value: 1.25, label: 'XL' },
          ]}
        />
      </Card>
      <Card>
        <SettingRow icon="reorder-four-outline" title={t('settings.compact')} subtitle={t('settings.compactSub')}>
          <Toggle value={s.compact} onChange={(compact) => updateSettings({ compact })} />
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="sparkles-outline" title={t('settings.reduceMotion')} subtitle={t('settings.reduceMotionSub')}>
          <Toggle value={s.reduceMotion} onChange={(reduceMotion) => updateSettings({ reduceMotion })} />
        </SettingRow>
      </Card>
      <Text style={{ color: theme.textFaint, fontSize: 12 }}> </Text>
    </>
  );
}

// ---------- Sprache & Video ----------

function DevicePicker({ label, devices, value, onChange }) {
  const t = useT();
  const theme = useTheme();
  const options = [{ deviceId: 'default', label: t('settings.defaultDevice') }, ...devices];
  return (
    <View style={{ gap: 6, padding: 14 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ gap: 2 }}>
        {options.map((d, i) => {
          const active = (value || 'default') === d.deviceId;
          return (
            <Pressy key={d.deviceId || i} onPress={() => onChange(d.deviceId)} style={{ borderRadius: 10, backgroundColor: active ? theme.accentSoft : 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
                <Icon name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? theme.accent : theme.textFaint} />
                <Text numberOfLines={1} style={{ color: theme.text, flex: 1 }}>
                  {d.label || `${label} ${i}`}
                </Text>
              </View>
            </Pressy>
          );
        })}
      </View>
    </View>
  );
}

function MicTest() {
  const theme = useTheme();
  const t = useT();
  const [running, setRunning] = useState(false);
  const level = useRef(new Animated.Value(0)).current;
  const stopRef = useRef(null);
  useEffect(() => () => stopRef.current?.(), []);
  const toggle = async () => {
    if (running) {
      stopRef.current?.();
      stopRef.current = null;
      level.setValue(0);
      return setRunning(false);
    }
    try {
      stopRef.current = await voice.micTest((l) => Animated.timing(level, { toValue: l, duration: 60, useNativeDriver: false }).start());
      setRunning(true);
    } catch {
      showToast(t('voice.micDenied'), 'error');
    }
  };
  const width = level.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={{ padding: 14, gap: 10 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('settings.micTest')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Button small icon={running ? 'stop' : 'mic'} title={running ? t('settings.micTestStop') : t('settings.micTestStart')} onPress={toggle} variant={running ? 'danger' : 'primary'} />
        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.input, overflow: 'hidden' }}>
          <Animated.View style={{ width, height: 10, borderRadius: 5, backgroundColor: theme.success }} />
        </View>
      </View>
    </View>
  );
}

function VoiceSection() {
  const theme = useTheme();
  const t = useT();
  const s = useStore((x) => x.settings);
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  useEffect(() => {
    voice.listDevices().then(setDevices);
  }, []);
  const set = async (patch) => {
    updateSettings(patch);
    await voice.refreshDevices();
  };
  if (!voice.supported) {
    return (
      <>
        <SectionTitle>{t('settings.voiceVideo')}</SectionTitle>
        <Card style={{ padding: 16, flexDirection: 'row', gap: 10 }}>
          <Icon name="information-circle" size={20} color={theme.accent} />
          <Text style={{ color: theme.text, flex: 1 }}>{t('voice.unsupported')}</Text>
        </Card>
      </>
    );
  }
  return (
    <>
      <SectionTitle>{t('settings.voiceVideo')}</SectionTitle>
      {Platform.OS === 'web' ? (
        <Card>
          <DevicePicker label={t('settings.inputDevice')} devices={devices.inputs} value={s.inputDeviceId} onChange={(inputDeviceId) => set({ inputDeviceId })} />
          {devices.outputs.length ? (
            <>
              <Divider />
              <DevicePicker label={t('settings.outputDevice')} devices={devices.outputs} value={s.outputDeviceId} onChange={(outputDeviceId) => set({ outputDeviceId })} />
            </>
          ) : null}
          <Divider />
          <MicTest />
        </Card>
      ) : null}
      <Card>
        <SettingRow icon="pulse-outline" title={t('settings.noiseSuppression')}>
          <Toggle value={s.noiseSuppression} onChange={(noiseSuppression) => set({ noiseSuppression })} />
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="repeat-outline" title={t('settings.echoCancellation')}>
          <Toggle value={s.echoCancellation} onChange={(echoCancellation) => set({ echoCancellation })} />
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="trending-up-outline" title={t('settings.autoGain')}>
          <Toggle value={s.autoGainControl} onChange={(autoGainControl) => set({ autoGainControl })} />
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="mic-off-outline" title={t('settings.joinMuted')}>
          <Toggle value={s.joinMuted} onChange={(joinMuted) => updateSettings({ joinMuted })} />
        </SettingRow>
      </Card>
    </>
  );
}

// ---------- Benachrichtigungen & Chat ----------

function NotificationsSection() {
  const t = useT();
  const theme = useTheme();
  const s = useStore((x) => x.settings);
  return (
    <>
      <SectionTitle>{t('settings.notifications')}</SectionTitle>
      <Card>
        <SettingRow icon="volume-medium-outline" title={t('settings.sounds')} subtitle={t('settings.soundsSub')}>
          <Toggle value={s.sounds} onChange={(sounds) => updateSettings({ sounds })} />
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="notifications-outline" title={t('settings.messageSound')} subtitle={t('settings.messageSoundSub')}>
          <Toggle value={s.messageSound} onChange={(messageSound) => updateSettings({ messageSound })} />
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="call-outline" title={t('settings.callSound')} subtitle={t('settings.callSoundSub')}>
          <Toggle value={s.callSound !== false} onChange={(callSound) => updateSettings({ callSound })} />
        </SettingRow>
        <Divider inset={46} />
        <View style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.text, fontWeight: '600', fontSize: theme.fs(15) }}>{t('settings.soundVolume')}</Text>
            <Button small variant="secondary" icon="play" title={t('settings.soundTest')} onPress={() => playSound('message', { force: true })} />
          </View>
          <Segmented
            value={s.soundVolume ?? 0.7}
            onChange={(soundVolume) => {
              updateSettings({ soundVolume });
              setTimeout(() => playSound('message', { force: true }), 30);
            }}
            options={[
              { value: 0.35, label: t('settings.volumeQuiet'), icon: 'volume-low-outline' },
              { value: 0.7, label: t('settings.volumeMedium'), icon: 'volume-medium-outline' },
              { value: 1, label: t('settings.volumeLoud'), icon: 'volume-high-outline' },
            ]}
          />
        </View>
        {Platform.OS === 'web' ? (
          <>
            <Divider inset={46} />
            <SettingRow icon="desktop-outline" title={t('settings.desktopNotifications')} subtitle={t('settings.desktopNotificationsSub')}>
              <Toggle
                value={s.desktopNotifications}
                onChange={(desktopNotifications) => {
                  updateSettings({ desktopNotifications });
                  if (desktopNotifications && typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
                }}
              />
            </SettingRow>
          </>
        ) : null}
      </Card>
    </>
  );
}

function ChatSection() {
  const t = useT();
  const s = useStore((x) => x.settings);
  return (
    <>
      <SectionTitle>{t('settings.chat')}</SectionTitle>
      <Card>
        {Platform.OS === 'web' ? (
          <>
            <SettingRow icon="return-down-back-outline" title={t('settings.enterToSend')} subtitle={t('settings.enterToSendSub')}>
              <Toggle value={s.enterToSend} onChange={(enterToSend) => updateSettings({ enterToSend })} />
            </SettingRow>
            <Divider inset={46} />
          </>
        ) : null}
        <SettingRow icon="time-outline" title={t('settings.showTimestamps')}>
          <Toggle value={s.showTimestamps} onChange={(showTimestamps) => updateSettings({ showTimestamps })} />
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="ellipsis-horizontal-circle-outline" title={t('settings.showTyping')}>
          <Toggle value={s.sendTyping} onChange={(sendTyping) => updateSettings({ sendTyping })} />
        </SettingRow>
      </Card>
    </>
  );
}

function LanguageSection() {
  const theme = useTheme();
  const t = useT();
  const s = useStore((x) => x.settings);
  const options = [{ value: 'system', label: `${t('settings.languageSystem')} (${LANGUAGE_NAMES[systemLanguage()]})` }, ...Object.keys(LANGUAGES).map((k) => ({ value: k, label: LANGUAGE_NAMES[k] || k }))];
  return (
    <>
      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Card>
        {options.map((o, i) => {
          const active = s.language === o.value;
          return (
            <View key={o.value}>
              {i ? <Divider inset={46} /> : null}
              <SettingRow icon={active ? 'radio-button-on' : 'radio-button-off'} title={o.label} onPress={() => updateSettings({ language: o.value })}>
                {active ? <Icon name="checkmark" size={18} color={theme.accent} /> : <View />}
              </SettingRow>
            </View>
          );
        })}
      </Card>
    </>
  );
}

function ConnectionSection() {
  const theme = useTheme();
  const t = useT();
  const serverUrl = useStore((s) => s.serverUrl);
  const turn = useStore((s) => s.settings.turn) || {};
  const [url, setUrl] = useState(serverUrl);
  const [turnUrl, setTurnUrl] = useState(turn.urls || '');
  const [turnUser, setTurnUser] = useState(turn.username || '');
  const [turnPass, setTurnPass] = useState(turn.credential || '');
  const [status, setStatus] = useState(null);
  return (
    <>
      <SectionTitle>{t('settings.connection')}</SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <Input label={t('settings.serverAddress')} hint={t('settings.serverAddressSub')} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button small variant="secondary" icon="pulse" title={t('auth.checkServer')} onPress={async () => setStatus((await checkServer(url)) ? 'ok' : 'fail')} />
          <Button
            small
            title={t('common.save')}
            disabled={normalizeUrl(url) === normalizeUrl(serverUrl)}
            onPress={() => {
              closeModal();
              logout();
              setState({ serverUrl: normalizeUrl(url) });
            }}
          />
          {status ? <Text style={{ color: status === 'ok' ? theme.success : theme.danger }}>{status === 'ok' ? t('auth.serverOk') : t('auth.serverFail')}</Text> : null}
        </View>
      </Card>
      <Card title="TURN (optional)" style={{ padding: 16, gap: 12 }}>
        <Input label="URL" value={turnUrl} onChangeText={setTurnUrl} placeholder="turn:example.com:3478" autoCapitalize="none" autoCorrect={false} />
        <Input label={t('auth.username')} value={turnUser} onChangeText={setTurnUser} autoCapitalize="none" />
        <Input label={t('common.password')} value={turnPass} onChangeText={setTurnPass} secureTextEntry />
        <Button
          small
          title={t('common.save')}
          onPress={() => {
            updateSettings({ turn: turnUrl.trim() ? { urls: turnUrl.trim(), username: turnUser, credential: turnPass } : null });
            showToast(t('common.saved'));
          }}
        />
      </Card>
    </>
  );
}

function AboutSection() {
  const theme = useTheme();
  const t = useT();
  return (
    <>
      <SectionTitle>{t('settings.about')}</SectionTitle>
      <Card style={{ padding: 20, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="flame" size={38} color="#fff" />
        </View>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Lodge</Text>
        <Text style={{ color: theme.textMuted, textAlign: 'center' }}>{t('settings.aboutText')}</Text>
      </Card>
      <Card>
        <SettingRow icon="information-circle-outline" title={t('settings.version')}>
          <Text style={{ color: theme.textMuted }}>{Constants.expoConfig?.version || '1.1.0'}</Text>
        </SettingRow>
        <Divider inset={46} />
        <SettingRow icon="hardware-chip-outline" title={t('settings.platform')}>
          <Text style={{ color: theme.textMuted }}>{typeof window !== 'undefined' && window.lodgeDesktop ? 'Desktop' : Platform.OS}</Text>
        </SettingRow>
      </Card>
    </>
  );
}

const SECTIONS = [
  { group: 'userSettings', key: 'account', icon: 'person-circle-outline', C: AccountSection },
  { group: 'userSettings', key: 'profile', icon: 'color-palette-outline', C: ProfileSection },
  { group: 'appSettings', key: 'appearance', icon: 'brush-outline', C: AppearanceSection },
  { group: 'appSettings', key: 'voiceVideo', icon: 'mic-outline', C: VoiceSection },
  { group: 'appSettings', key: 'notifications', icon: 'notifications-outline', C: NotificationsSection },
  { group: 'appSettings', key: 'chat', icon: 'chatbubbles-outline', C: ChatSection },
  { group: 'appSettings', key: 'language', icon: 'language-outline', C: LanguageSection },
  { group: 'appSettings', key: 'connection', icon: 'server-outline', C: ConnectionSection },
  { group: 'appSettings', key: 'about', icon: 'information-circle-outline', C: AboutSection },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const t = useT();
  const mobile = useIsMobile();
  const [active, setActive] = useState(mobile ? null : 'account');
  const section = SECTIONS.find((s) => s.key === active);

  const confirmLogout = () =>
    openModal('confirm', {
      title: t('settings.logout'),
      text: t('settings.logoutConfirm'),
      danger: true,
      confirmLabel: t('settings.logout'),
      onConfirm: () => logout(),
    });

  const nav = (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 2, paddingTop: mobile ? 12 : 40 }}>
      {['userSettings', 'appSettings'].map((group) => (
        <View key={group} style={{ marginBottom: 10 }}>
          <Text style={{ color: theme.textFaint, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 12, marginBottom: 4 }}>{t(`settings.${group}`)}</Text>
          {SECTIONS.filter((s) => s.group === group).map((s) => (
            <Pressy key={s.key} onPress={() => setActive(s.key)} style={{ borderRadius: 10, backgroundColor: active === s.key ? theme.active : 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Icon name={s.icon} size={19} color={active === s.key ? theme.text : theme.textMuted} />
                <Text style={{ color: active === s.key ? theme.text : theme.textMuted, fontWeight: '600', fontSize: theme.fs(15), flex: 1 }}>{t(`settings.${s.key}`)}</Text>
                {mobile ? <Icon name="chevron-forward" size={16} color={theme.textFaint} /> : null}
              </View>
            </Pressy>
          ))}
        </View>
      ))}
      <Pressy onPress={confirmLogout} style={{ borderRadius: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Icon name="log-out-outline" size={19} color={theme.danger} />
          <Text style={{ color: theme.danger, fontWeight: '600', fontSize: theme.fs(15) }}>{t('settings.logout')}</Text>
        </View>
      </Pressy>
    </ScrollView>
  );

  const content = section ? (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 40, gap: 18, maxWidth: 720, width: '100%' }} keyboardShouldPersistTaps="handled">
      <FadeIn deps={[active]} style={{ gap: 18 }}>
        <section.C />
      </FadeIn>
    </ScrollView>
  ) : null;

  if (mobile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
          <IconButton icon={section ? 'arrow-back' : 'close'} onPress={() => (section ? setActive(null) : closeModal())} />
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: theme.fs(17) }}>{section ? t(`settings.${section.key}`) : t('settings.title')}</Text>
        </View>
        {section ? content : nav}
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1, alignItems: 'flex-end', backgroundColor: theme.sidebar }}>
        <View style={{ width: 240 }}>{nav}</View>
      </View>
      <View style={{ flex: 2.2, flexDirection: 'row' }}>
        {content}
        <View style={{ paddingTop: 40, paddingRight: 20, alignItems: 'center', gap: 4 }}>
          <IconButton icon="close" box={40} filled onPress={closeModal} label={t('common.close')} />
          <Text style={{ color: theme.textFaint, fontSize: 11, fontWeight: '700' }}>ESC</Text>
        </View>
      </View>
    </View>
  );
}
