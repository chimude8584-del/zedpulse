import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as Font from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Home, Plus, Activity, MessageSquare } from "lucide-react-native";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";

LogBox.ignoreAllLogs(true);

// Icon prewarm — references keep lucide bundled for Expo Go android.
void Home; void Plus; void Activity; void MessageSquare;

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      try {
        void Font.getLoadedFonts?.();
      } catch {}
    }
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
