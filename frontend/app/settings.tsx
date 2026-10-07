import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, LogOut, FileText, HeartPulse, Bell, Pill, Link2, Users, Utensils, Hospital, TrendingUp, Store, Sun, Moon, Monitor, Trash2 } from "lucide-react-native";

import { api, clearToken } from "@/src/api";
import { makeStyles, useTheme, spacing, radius, setThemePref, type ThemePref } from "@/src/theme";

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
  themeSection: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
  themeRow: { flexDirection: "row", gap: spacing.sm },
  themeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  themeChipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  themeChipTxt: { fontSize: 13, color: c.onSurfaceTertiary, fontWeight: "600" },
  themeChipTxtActive: { color: c.onBrandPrimary, fontWeight: "700" },
  deleteTrigger: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  deleteTriggerTxt: { color: c.error, fontSize: 14, fontWeight: "600" },
  deleteCard: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.error },
  deleteTitle: { fontSize: 16, fontWeight: "700", color: c.error, marginBottom: spacing.xs },
  deleteBody: { fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 18 },
  deleteBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: "center" },
  deleteCancel: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  deleteCancelTxt: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  deleteConfirm: { backgroundColor: c.error },
  deleteConfirmTxt: { color: c.onError, fontSize: 14, fontWeight: "700" },
}));

export default function Settings() {
  const styles = useStyles();
  const { colors, pref } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

  const initial = (user?.name || user?.phone || "U").trim().charAt(0).toUpperCase();

  async function logout() {
    await clearToken();
    qc.clear();
    router.replace("/(auth)/login");
  }

  const delMut = useMutation({
    mutationFn: () => api.deleteAccount(),
    onSuccess: async () => {
      await clearToken();
      qc.clear();
      router.replace("/(auth)/login");
    },
  });

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

        <TouchableOpacity testID="settings-food" style={styles.item} onPress={() => router.push("/food-scanner")}>
          <Utensils size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Food scanner</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="settings-clinics" style={styles.item} onPress={() => router.push("/clinics")}>
          <Hospital size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Nearby clinics</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="settings-pharmacy" style={styles.item} onPress={() => router.push("/pharmacy")}>
          <Store size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Pharmacy watch</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="settings-insights" style={styles.item} onPress={() => router.push("/weekly-insights")}>
          <TrendingUp size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Weekly insights</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="settings-family" style={styles.item} onPress={() => router.push("/family-alerts")}>
          <Users size={18} color={colors.brand} />
          <Text style={styles.itemTxt}>Family alerts</Text>
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

        <View style={styles.themeSection}>
          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.themeRow}>
            {(["system", "light", "dark"] as ThemePref[]).map((p) => {
              const active = pref === p;
              const Icon = p === "system" ? Monitor : p === "light" ? Sun : Moon;
              return (
                <TouchableOpacity
                  key={p}
                  testID={`theme-${p}`}
                  style={[styles.themeChip, active && styles.themeChipActive]}
                  onPress={() => setThemePref(p)}
                >
                  <Icon size={16} color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                  <Text style={[styles.themeChipTxt, active && styles.themeChipTxtActive]}>
                    {p === "system" ? "System" : p === "light" ? "Light" : "Dark"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity testID="settings-logout" style={styles.logout} onPress={logout}>
          <LogOut size={18} color={colors.error} />
          <Text style={styles.logoutTxt}>Sign out</Text>
        </TouchableOpacity>

        {confirmDel ? (
          <View style={styles.deleteCard} testID="delete-confirm">
            <Text style={styles.deleteTitle}>Delete account?</Text>
            <Text style={styles.deleteBody}>
              This permanently removes your readings, medications, reminders, and family contact. You cannot undo this.
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity
                testID="delete-cancel"
                style={[styles.deleteBtn, styles.deleteCancel]}
                onPress={() => setConfirmDel(false)}
              >
                <Text style={styles.deleteCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="delete-confirm-btn"
                style={[styles.deleteBtn, styles.deleteConfirm]}
                onPress={() => delMut.mutate()}
                disabled={delMut.isPending}
              >
                {delMut.isPending ? (
                  <ActivityIndicator color={colors.onError} />
                ) : (
                  <Text style={styles.deleteConfirmTxt}>Yes, delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity testID="settings-delete" style={styles.deleteTrigger} onPress={() => setConfirmDel(true)}>
            <Trash2 size={16} color={colors.error} />
            <Text style={styles.deleteTriggerTxt}>Delete account</Text>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerTxt}>
            ZedPulse keeps your log on your account. Educational tool only — always consult a clinician.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
