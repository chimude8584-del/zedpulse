import { View, Text } from "react-native";
import { WifiOff } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsOnline } from "@/src/utils/network";
import { makeStyles, spacing } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  banner: {
    backgroundColor: c.warning,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  txt: { color: c.onWarning, fontSize: 12, fontWeight: "700" },
}));

export function OfflineBanner() {
  const styles = useStyles();
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4 }]} testID="offline-banner">
      <WifiOff size={14} color="#FFFFFF" />
      <Text style={styles.txt}>You&apos;re offline — using cached data</Text>
    </View>
  );
}
