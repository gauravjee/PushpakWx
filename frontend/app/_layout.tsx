import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { PrefsProvider } from "@/src/context/PrefsContext";
import { ThemeProvider, useTheme } from "@/src/context/ThemeContext";
// Registers the background flight-recording task as soon as the JS bundle
// loads — required so it's available even if the OS relaunches a headless
// JS context purely to service a background location update, without ever
// reaching this file through a normal app-open flow otherwise.
import "@/src/services/backgroundLocationTask";
import "@/src/services/stopWarningNotifications";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function ThemedShell() {
  const { effectiveScheme, colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={effectiveScheme === "light" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
          animation: "fade",
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PrefsProvider>
          <ThemeProvider>
            <ThemedShell />
          </ThemeProvider>
        </PrefsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
