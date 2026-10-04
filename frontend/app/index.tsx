import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";

import { getToken } from "@/src/api";
import { useTheme } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) router.replace("/(tabs)");
      else router.replace("/(auth)/login");
    })();
  }, [router]);

  return (
    <View
      testID="splash-screen"
      style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
    >
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}
