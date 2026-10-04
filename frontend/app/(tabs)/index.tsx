import { useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, HeartPulse, Settings, FileText, AlertTriangle, CheckCircle2, Bell, Pill, Flame, Utensils, Hospital, TrendingUp, MessageCircle } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { fmtDate, severityColor } from "@/src/utils/format";
import { waMessage } from "@/app/family-alerts";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  hello: { fontSize: 14, color: c.muted },
  greet: { fontSize: 28, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border,
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: {
    backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: c.border,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  cardTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5, color: c.muted, textTransform: "uppercase" },
  bigValue: { fontSize: 42, fontWeight: "800", color: c.onSurface, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 15, color: c.muted, fontWeight: "500" },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
  },
  statusChipText: { fontSize: 12, fontWeight: "700" },
  cardFooter: { marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeTxt: { fontSize: 12, color: c.muted },
  avgTxt: { fontSize: 12, color: c.onSurfaceTertiary, fontWeight: "600" },
  emptyTxt: { fontSize: 15, color: c.muted, marginTop: spacing.sm },
  quickRow: { flexDirection: "row", gap: spacing.md },
  quickBtn: {
    flex: 1, backgroundColor: c.brandPrimary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6,
  },
  quickBtnTxt: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  secondaryBtn: {
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingVertical: 14, alignItems: "center",
    flexDirection: "row", justifyContent: "center", gap: 6,
  },
  secondaryBtnTxt: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  alertBanner: {
    flexDirection: "row", gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.lg, backgroundColor: c.surfaceSecondary,
    borderLeftWidth: 4,
  },
  alertTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface, marginBottom: 2 },
  alertMsg: { fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 18 },
  rangePill: {
    paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill,
    backgroundColor: c.brandSecondary,
  },
  rangePillTxt: { fontSize: 12, color: c.onBrandSecondary, fontWeight: "700" },
  streakChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: c.warning + "22",
  },
  streakTxt: { fontSize: 12, color: c.warning, fontWeight: "700" },
  waAlertBtn: {
    marginTop: spacing.sm, backgroundColor: "#25D366",
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.md, flexDirection: "row", alignItems: "center",
    alignSelf: "flex-start", gap: 6,
  },
  waAlertBtnTxt: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  alertLink: { marginTop: spacing.sm, color: c.error, fontSize: 13, fontWeight: "600" },
}));

export default function Dashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["summary"],
    queryFn: () => api.summary(),
  });
  const { data: contact } = useQuery({ queryKey: ["emergency-contact"], queryFn: () => api.getEmergencyContact() });

  const onRefresh = useCallback(() => {
    refetch();
    qc.invalidateQueries({ queryKey: ["me"] });
  }, [refetch, qc]);

  const g = data?.glucose;
  const b = data?.bp;
  const latestG = g?.latest;
  const latestB = b?.latest;

  const criticalAlerts = [latestG, latestB].filter(
    (r: any) => r && r.severity === "critical",
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hello{user?.name ? "," : ""}</Text>
          <Text style={styles.greet} testID="dashboard-greet">
            {user?.name || "Welcome back"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {data?.streak_days ? (
            <View style={styles.streakChip} testID="streak-chip">
              <Flame size={14} color={colors.warning} />
              <Text style={styles.streakTxt}>{data.streak_days}d streak</Text>
            </View>
          ) : null}
          <TouchableOpacity
            testID="open-settings-button"
            style={styles.iconBtn}
            onPress={() => router.push("/settings")}
          >
            <Settings size={20} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: spacing.md }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.brand} />
        ) : null}

        {criticalAlerts.map((r: any, i: number) => (
          <View key={i} style={[styles.alertBanner, { borderLeftColor: colors.error }]} testID={`critical-alert-${i}`}>
            <AlertTriangle color={colors.error} size={22} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{r.label}</Text>
              <Text style={styles.alertMsg}>{r.message}</Text>
              {contact?.phone ? (
                <TouchableOpacity
                  testID={`alert-whatsapp-${i}`}
                  style={styles.waAlertBtn}
                  onPress={() => {
                    const msg = `URGENT: My ZedPulse reading is ${r.label}${"value" in r ? ` — ${r.value} mmol/L` : ""}${"systolic" in r ? ` — ${r.systolic}/${r.diastolic} mmHg` : ""}. ${r.message}`;
                    Linking.openURL(waMessage(contact.phone!, msg)).catch(() => {});
                  }}
                >
                  <MessageCircle size={14} color="#FFFFFF" />
                  <Text style={styles.waAlertBtnTxt}>WhatsApp {contact.name || "family"}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity testID={`alert-setup-family-${i}`} onPress={() => router.push("/family-alerts")}>
                  <Text style={styles.alertLink}>Set up family alerts →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {/* Glucose card */}
        <TouchableOpacity
          testID="glucose-card"
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => router.push("/(tabs)/history?tab=glucose")}
        >
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Activity size={16} color={colors.brand} />
              <Text style={styles.cardTitle}>Blood Glucose</Text>
            </View>
            {latestG ? (
              <View style={[styles.statusChip, { backgroundColor: severityColor(latestG.severity, colors) + "22" }]}>
                <Text style={[styles.statusChipText, { color: severityColor(latestG.severity, colors) }]}>
                  {latestG.label}
                </Text>
              </View>
            ) : null}
          </View>
          {latestG ? (
            <>
              <View style={styles.valueRow}>
                <Text style={styles.bigValue}>{latestG.value}</Text>
                <Text style={styles.unit}>mmol/L</Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.timeTxt}>{fmtDate(latestG.timestamp)}</Text>
                {g?.avg_mmol_l ? (
                  <Text style={styles.avgTxt}>30-day avg {g.avg_mmol_l}</Text>
                ) : null}
              </View>
              {g?.in_range_pct != null ? (
                <View style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={14} color={colors.success} />
                  <Text style={styles.avgTxt}>{g.in_range_pct}% in range (last 30)</Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyTxt}>No glucose readings yet. Tap “Log” to add one.</Text>
          )}
        </TouchableOpacity>

        {/* BP card */}
        <TouchableOpacity
          testID="bp-card"
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => router.push("/(tabs)/history?tab=bp")}
        >
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <HeartPulse size={16} color={colors.brand} />
              <Text style={styles.cardTitle}>Blood Pressure</Text>
            </View>
            {latestB ? (
              <View style={[styles.statusChip, { backgroundColor: severityColor(latestB.severity, colors) + "22" }]}>
                <Text style={[styles.statusChipText, { color: severityColor(latestB.severity, colors) }]}>
                  {latestB.label}
                </Text>
              </View>
            ) : null}
          </View>
          {latestB ? (
            <>
              <View style={styles.valueRow}>
                <Text style={styles.bigValue}>{latestB.systolic}/{latestB.diastolic}</Text>
                <Text style={styles.unit}>mmHg</Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.timeTxt}>{fmtDate(latestB.timestamp)}</Text>
                {b?.avg_systolic ? (
                  <Text style={styles.avgTxt}>30-day avg {b.avg_systolic}/{b.avg_diastolic}</Text>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={styles.emptyTxt}>No BP readings yet. Tap “Log” to add one.</Text>
          )}
        </TouchableOpacity>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            testID="quick-log-button"
            style={styles.quickBtn}
            onPress={() => router.push("/(tabs)/log")}
          >
            <PlusIcon />
            <Text style={styles.quickBtnTxt}>Log reading</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="open-report-button"
            style={styles.secondaryBtn}
            onPress={() => router.push("/report")}
          >
            <FileText size={16} color={colors.onSurface} />
            <Text style={styles.secondaryBtnTxt}>Share report</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            testID="open-reminders-button"
            style={styles.secondaryBtn}
            onPress={() => router.push("/reminders")}
          >
            <Bell size={16} color={colors.onSurface} />
            <Text style={styles.secondaryBtnTxt}>Reminders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="open-medications-button"
            style={styles.secondaryBtn}
            onPress={() => router.push("/medications")}
          >
            <Pill size={16} color={colors.onSurface} />
            <Text style={styles.secondaryBtnTxt}>Medications</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            testID="open-food-button"
            style={styles.secondaryBtn}
            onPress={() => router.push("/food-scanner")}
          >
            <Utensils size={16} color={colors.onSurface} />
            <Text style={styles.secondaryBtnTxt}>Food scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="open-clinics-button"
            style={styles.secondaryBtn}
            onPress={() => router.push("/clinics")}
          >
            <Hospital size={16} color={colors.onSurface} />
            <Text style={styles.secondaryBtnTxt}>Clinics</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="open-insights-button"
          style={[styles.secondaryBtn, { marginTop: 0 }]}
          onPress={() => router.push("/weekly-insights")}
        >
          <TrendingUp size={16} color={colors.onSurface} />
          <Text style={styles.secondaryBtnTxt}>Weekly insights</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function PlusIcon() {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.onBrandPrimary, fontSize: 20, fontWeight: "700", marginRight: 2 }}>+</Text>
  );
}
