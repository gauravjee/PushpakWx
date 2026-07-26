// Shown exactly once per device, before any anonymous browsing is allowed —
// runs Cloudflare's Turnstile challenge (invisible for legitimate users in
// the vast majority of cases) and reports the resulting token back to the
// backend for verification. Turnstile itself is a web widget; there's no
// native SDK, so this is necessarily a WebView embedding a small self-
// contained HTML page — not a heavier dependency than that requires.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useThemeColors } from '@/src/context/ThemeContext';
import { spacing } from '@/src/theme';
import { verifyDeviceWithBackend } from '@/src/utils/anonymousAccess';

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';

function buildHtml(siteKey: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    body { display: flex; align-items: center; justify-content: center; height: 100vh; }
  </style>
</head>
<body>
  <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onVerified" data-error-callback="onError"></div>
  <script>
    function onVerified(token) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'verified', token }));
    }
    function onError() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
    }
  </script>
</body>
</html>`;
}

type Props = {
  onVerified: () => void;
  onError: () => void;
};

export function TurnstileVerification({ onVerified, onError }: Props) {
  const colors = useThemeColors();
  const [checking, setChecking] = useState(false);

  const handleMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'verified' && !checking) {
        setChecking(true);
        const ok = await verifyDeviceWithBackend(msg.token);
        setChecking(false);
        if (ok) onVerified();
        else onError();
      } else if (msg.type === 'error') {
        onError();
      }
    } catch {
      onError();
    }
  };

  useEffect(() => {
    if (!SITE_KEY) {
      // Not yet provisioned — matches the backend's fail-open behavior when
      // TURNSTILE_SECRET_KEY is unset, so the rest of anonymous access can
      // still be built/tested before Cloudflare keys are actually set up.
      // Must actively call onError here, not just render nothing — a
      // silent blank screen would strand the person with no way forward.
      onError();
    }
  }, [onError]);

  if (!SITE_KEY) {
    return null;
  }

  return (
    <View style={styles.container} testID="turnstile-screen">
      <Text style={[styles.title, { color: colors.onSurface }]}>Just a moment</Text>
      <Text style={[styles.subtitle, { color: colors.onSurfaceSecondary }]}>
        Confirming you're not a bot — this only happens once.
      </Text>
      <View style={styles.widgetWrap}>
        <WebView
          testID="turnstile-webview"
          originWhitelist={['*']}
          source={{ html: buildHtml(SITE_KEY) }}
          onMessage={handleMessage}
          style={{ backgroundColor: 'transparent' }}
          javaScriptEnabled
        />
      </View>
      {checking && <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: 20, fontWeight: '800', marginBottom: spacing.sm },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: spacing.lg },
  widgetWrap: { width: 300, height: 80 },
});
