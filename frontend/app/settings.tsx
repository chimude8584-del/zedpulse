import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LogOut, FileText, HeartPulse, Bell, Pill, Link2 } from "lucide-react-native";

import { api, clearToken } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  profile: {
    marginHorizontal: spacing.xl, padding: spacing.xl, borderRadius: radius.lg,
    backgroundColor: c.brandSecondary, alignItems: "center",
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandPrimary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  avatarTxt: { color: c.onBrandPrimary, fontSize: 24, fontWeight: "700" },
  name: { fontSize: 18, fontWeight: "700", color: c.onBrandSecondary },
  phone: { fontSize: 14, color: c.onBrandSecondary, marginTop: 2, opacity: 0.8 },
  item: {
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    padding: spacing.lg, borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  itemTxt: { fontSize: 15, color: c.onSurface, flex: 1, fontWeight: "500" },
  logout: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    padding: spacing.lg, borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.error,
    flexDirection: "row", alignItems: "center", gap: spacing.md, justifyContent: "center",
  },
  logoutTxt: { color: c.error, fontSize: 15, fontWeight: "600" },
  footer: { padding: spacing.xl, alignItems: "center" },
  footerTxt: { fontSize: 12, color: c.muted, textAlign: "center" },
}));

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

  const initial = (user?.name || user?.phone || "U").trim().charAt(0).toUpperCase();

  async function logout() {
    await clearToken();
    qc.clear();
    router.replace("/(auth)/login");
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="settings-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{initial}</Text></View>
          <Text style={styles.name} testID="profile-name">{user?.name || "User"}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
        </View>

        <TouchableOpacity testID="settings-reminders" style={styles.item} onPress={() => router.push("/reminders")}>
          <Bell size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Reminders</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="settings-medications" style={styles.item} onPress={() => router.push("/medications")}>
          <Pill size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Medications</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="settings-share" style={styles.item} onPress={() => router.push("/share-link")}>
          <Link2 size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Doctor share link</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="settings-report" style={styles.item} onPress={() => router.push("/report")}>
          <FileText size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Export doctor report</Text>
        </TouchableOpacity>

        <View style={styles.item}>
          <HeartPulse size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Units: mmol/L · mmHg · Zambia</Text>
        </View>

        <TouchableOpacity testID="settings-logout" style={styles.logout} onPress={logout}>
          <LogOut size={18} color={colors.error} />
          <Text style={styles.logoutTxt}>Sign out</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerTxt}>
            VitaTrack keeps your log on your account. Educational tool only — always consult a clinician.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
