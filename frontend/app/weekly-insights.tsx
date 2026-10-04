import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Activity, HeartPulse, Pill, Sparkles } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  subtitle: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.lg },
  tipCard: { marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.brandSecondary, marginBottom: spacing.lg },
  tipHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  tipTitle: { fontSize: 14, fontWeight: "700", color: c.onBrandSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  tipTxt: { fontSize: 15, color: c.onBrandSecondary, lineHeight: 22 },
  statsGrid: { paddingHorizontal: spacing.xl, flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { flexGrow: 1, flexBasis: "45%", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  statHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  statLabel: { fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 28, fontWeight: "800", color: c.onSurface, fontVariant: ["tabular-nums"] },
  statUnit: { fontSize: 12, color: c.muted, fontWeight: "500" },
  statSub: { fontSize: 12, color: c.muted, marginTop: 4 },
  rangeCard: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  barWrap: { height: 10, backgroundColor: c.surfaceTertiary, borderRadius: 5, overflow: "hidden", marginTop: spacing.sm },
  bar: { height: 10, backgroundColor: c.success, borderRadius: 5 },
  footer: { padding: spacing.xl, alignItems: "center" },
  footerTxt: { color: c.muted, fontSize: 12, textAlign: "center" },
}));

export default function WeeklyInsights() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const q = useQuery({ queryKey: ["weekly-insights"], queryFn: () => api.weeklyInsights() });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="wi-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Weekly insights</Text>
      </View>
      <Text style={styles.subtitle}>How the last 7 days have gone.</Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.brand} />}
      >
        {q.isLoading ? (
          <ActivityIndicator color={colors.brand} />
        ) : !q.data ? null : (
          <>
            {q.data.tip ? (
              <View style={styles.tipCard} testID="wi-tip">
                <View style={styles.tipHead}>
                  <Sparkles size={16} color={colors.onBrandSecondary} />
                  <Text style={styles.tipTitle}>Your Zambian tip</Text>
                </View>
                <Text style={styles.tipTxt}>{q.data.tip}</Text>
              </View>
            ) : null}

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statHead}>
                  <Activity size={14} color={colors.brand} />
                  <Text style={styles.statLabel}>Glucose avg</Text>
                </View>
                <Text style={styles.statValue}>
                  {q.data.glucose.avg_mmol_l ?? "—"} <Text style={styles.statUnit}>mmol/L</Text>
                </Text>
                <Text style={styles.statSub}>{q.data.glucose.count} readings</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statHead}>
                  <HeartPulse size={14} color={colors.brand} />
                  <Text style={styles.statLabel}>BP avg</Text>
                </View>
                <Text style={styles.statValue}>
                  {q.data.bp.avg_systolic ?? "—"}/{q.data.bp.avg_diastolic ?? "—"}
                </Text>
                <Text style={styles.statSub}>{q.data.bp.count} readings</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statHead}>
                  <TrendingUp size={14} color={colors.brand} />
                  <Text style={styles.statLabel}>In range</Text>
                </View>
                <Text style={styles.statValue}>
                  {q.data.glucose.in_range_pct ?? "—"}<Text style={styles.statUnit}>%</Text>
                </Text>
                <Text style={styles.statSub}>of glucose readings</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statHead}>
                  <Pill size={14} color={colors.brand} />
                  <Text style={styles.statLabel}>Adherence</Text>
                </View>
                <Text style={styles.statValue}>
                  {q.data.medications.adherence_pct ?? "—"}<Text style={styles.statUnit}>%</Text>
                </Text>
                <Text style={styles.statSub}>
                  {q.data.medications.logged}/{q.data.medications.expected || 0} doses
                </Text>
              </View>
            </View>

            {q.data.glucose.in_range_pct != null && (
              <View style={styles.rangeCard} testID="wi-range">
                <Text style={styles.statLabel}>Time in range</Text>
                <View style={styles.barWrap}>
                  <View style={[styles.bar, { width: `${q.data.glucose.in_range_pct}%` }]} />
                </View>
                <Text style={styles.statSub}>Aim for 70% or higher. Keep logging to see trends.</Text>
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerTxt}>Pull down to refresh. Insights update automatically each week.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
