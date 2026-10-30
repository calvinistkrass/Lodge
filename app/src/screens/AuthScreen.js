import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useT, errorText } from '../i18n';
import { useStore, setState } from '../store';
import { login, register, checkServer, normalizeUrl } from '../api';
import { Button, Input, Icon, FadeIn, Pressy } from '../ui';

export default function AuthScreen() {
  const theme = useTheme();
  const t = useT();
  const serverUrl = useStore((s) => s.serverUrl);
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);

  const submit = async () => {
    setError(null);
    if (mode === 'register' && password !== password2) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), displayName.trim(), password);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const testServer = async () => {
    setServerStatus('checking');
    setServerStatus((await checkServer(serverUrl)) ? 'ok' : 'fail');
  };

  const isLogin = mode === 'login';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
          <FadeIn deps={[mode]} style={{ width: '100%', maxWidth: 420 }}>
            <View style={{ backgroundColor: theme.panel, borderRadius: 24, padding: 28, gap: 18, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, shadowOffset: { width: 0, height: 12 } }}>
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="flame" size={34} color="#fff" />
                </View>
                <Text style={{ color: theme.text, fontSize: theme.fs(24), fontWeight: '800' }}>{isLogin ? t('auth.welcome') : t('auth.createAccount')}</Text>
                <Text style={{ color: theme.textMuted, fontSize: theme.fs(14) }}>{isLogin ? t('auth.welcomeSub') : t('auth.createSub')}</Text>
              </View>

              <Input label={t('auth.username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} icon="at" autoComplete="username" onSubmitEditing={submit} />
              {!isLogin ? <Input label={t('auth.displayName')} value={displayName} onChangeText={setDisplayName} icon="person-outline" /> : null}
              <Input label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry icon="lock-closed-outline" autoComplete={isLogin ? 'current-password' : 'new-password'} onSubmitEditing={submit} />
              {!isLogin ? <Input label={t('auth.passwordRepeat')} value={password2} onChangeText={setPassword2} secureTextEntry icon="lock-closed-outline" onSubmitEditing={submit} /> : null}

              {error ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: theme.danger + '22', padding: 12, borderRadius: 12 }}>
                  <Icon name="alert-circle" size={18} color={theme.danger} />
                  <Text style={{ color: theme.danger, flex: 1, fontSize: theme.fs(13) }}>{error}</Text>
                </View>
              ) : null}

              <Button title={isLogin ? t('auth.login') : t('auth.register')} onPress={submit} loading={busy} full />

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ color: theme.textMuted }}>{isLogin ? t('auth.noAccount') : t('auth.haveAccount')}</Text>
                <Pressy onPress={() => { setMode(isLogin ? 'register' : 'login'); setError(null); }} style={{ borderRadius: 6, paddingHorizontal: 4 }}>
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>{isLogin ? t('auth.register') : t('auth.login')}</Text>
                </Pressy>
              </View>

              <Pressy onPress={() => setShowServer(!showServer)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, borderRadius: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  <Icon name="server-outline" size={14} color={theme.textFaint} />
                  <Text style={{ color: theme.textFaint, fontSize: theme.fs(12) }}>{normalizeUrl(serverUrl)}</Text>
                  <Icon name={showServer ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textFaint} />
                </View>
              </Pressy>
              {showServer ? (
                <FadeIn style={{ gap: 10 }}>
                  <Input label={t('auth.serverUrl')} hint={t('auth.serverUrlHint')} value={serverUrl} onChangeText={(v) => { setState({ serverUrl: v }); setServerStatus(null); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Button small variant="secondary" icon="pulse" title={t('auth.checkServer')} onPress={testServer} loading={serverStatus === 'checking'} />
                    {serverStatus === 'ok' || serverStatus === 'fail' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon name={serverStatus === 'ok' ? 'checkmark-circle' : 'close-circle'} size={16} color={serverStatus === 'ok' ? theme.success : theme.danger} />
                        <Text style={{ color: serverStatus === 'ok' ? theme.success : theme.danger, fontSize: theme.fs(13) }}>{serverStatus === 'ok' ? t('auth.serverOk') : t('auth.serverFail')}</Text>
                      </View>
                    ) : null}
                  </View>
                </FadeIn>
              ) : null}
            </View>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
