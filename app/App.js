import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { loadPersisted, useStore, getState, setState, openModal } from './src/store';
import { startSession, logout } from './src/api';
import { useTheme } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import MainScreen from './src/screens/MainScreen';
import { ModalHost, ToastHost, IncomingCall } from './src/screens/Overlays';
import { inviteCodeFromUrl } from './src/util';

function handleUrl(url) {
  const code = inviteCodeFromUrl(url);
  if (!code) return;
  // Im Browser die Adresszeile aufräumen, damit ein Neuladen den Dialog nicht erneut öffnet.
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(null, '', '/');
  if (getState().me) openModal('joinServer', { code });
  else setState({ pendingInvite: code });
}

export default function App() {
  const theme = useTheme();
  const ready = useStore((s) => s.ready);
  const me = useStore((s) => s.me);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      await loadPersisted();
      const { token } = getState();
      if (token) {
        try {
          await startSession(token);
        } catch (e) {
          if (e.code !== 'network') logout();
        }
      }
      setBooting(false);
      Linking.getInitialURL().then(handleUrl).catch(() => {});
    })();
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const code = getState().pendingInvite;
    if (me && code) {
      setState({ pendingInvite: null });
      openModal('joinServer', { code });
    }
  }, [me]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.bg;
      document.documentElement.style.colorScheme = theme.isDark ? 'dark' : 'light';
    }
  }, [theme.bg]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        {!ready || booting ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        ) : me ? (
          <MainScreen />
        ) : (
          <AuthScreen />
        )}
        <IncomingCall />
        <ModalHost />
        <ToastHost />
      </View>
    </SafeAreaProvider>
  );
}
