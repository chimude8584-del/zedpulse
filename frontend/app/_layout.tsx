import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import * as Font from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Home, Plus, Activity, MessageSquare } from "lucide-react-native";
import { useEffect } from "react";
import { LogBox, Platform, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { OfflineBanner } from "@/src/components/offline-banner";
import { queryClient } from "@/src/query-client";
import { setupOnlineManager } from "@/src/utils/network";

LogBox.ignoreAllLogs(true);

// Icon prewarm — references keep lucide bundled for Expo Go android.
void Home; void Plus; void Activity; void MessageSquare;

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "zedpulse.react-query-cache",
  throttleTime: 1000,
});

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      try {
        void Font.getLoadedFonts?.();
      } catch {}
    }
    const unsub = setupOnlineManager();
    return () => {
      try { (unsub as any)?.(); } catch {}
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24 * 90, // 90 days of cache
            buster: "v1",
          }}
        >
          <KeyboardProvider>
            <StatusBar style="auto" />
            <View style={{ flex: 1 }}>
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false }} />
            </View>
          </KeyboardProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
