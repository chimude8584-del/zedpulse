import { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Trash2, Activity, HeartPulse } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { fmtDate, severityColor, contextLabels } from "@/src/utils/format";
import { MiniLineChart } from "@/src/components/mini-line-chart";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  segmentRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  segment: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  segmentActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  segmentTxt: { fontSize: 14, fontWeight: "600", color: c.onSurfaceTertiary },
  segmentTxtActive: { color: c.onBrandPrimary },
  chartCard: {
    marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  chartLabel: { fontSize: 12, color: c.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  chartCaption: { fontSize: 12, color: c.muted, marginTop: 4 },
  listTitle: { fontSize: 14, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    padding: spacing.lg, borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  rowValue: { fontSize: 20, fontWeight: "700", color: c.onSurface, fontVariant: ["tabular-nums"] },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  deleteBtn: { padding: spacing.sm, borderRadius: radius.pill },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyTxt: { color: c.muted, fontSize: 14 },
  rangeLabel: { fontSize: 11, color: c.onBrandSecondary, backgroundColor: c.brandSecondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
}));

export default function History() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [mode, setMode] = useState<"glucose" | "bp">(params.tab === "bp" ? "bp" : "glucose");

  const gq = useQuery({ queryKey: ["glucose-list"], queryFn: () => api.listGlucose() });
  const bq = useQuery({ queryKey: ["bp-list"], queryFn: () => api.listBP() });

  const delG = useMutation({
    mutationFn: (id: string) => api.deleteGlucose(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["glucose-list"] }); qc.invalidateQueries({ queryKey: ["summary"] }); },
  });
  const delB = useMutation({
    mutationFn: (id: string) => api.deleteBP(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bp-list"] }); qc.invalidateQueries({ queryKey: ["summary"] }); },
  });

  const glucoseData = gq.data || [];
  const bpData = bq.data || [];

  const glucoseChartValues = useMemo(
    () => [...glucoseData].slice(0, 20).reverse().map((g: any) => g.value),
    [glucoseData],
  );
  const bpSysValues = useMemo(
    () => [...bpData].slice(0, 20).reverse().map((b: any) => b.systolic),
    [bpData],
  );

  const refreshing = mode === "glucose" ? gq.isRefetching : bq.isRefetching;
  const onRefresh = () => { if (mode === "glucose") gq.refetch(); else bq.refetch(); };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      <View style={styles.segmentRow}>
        <TouchableOpacity
          testID="hist-tab-glucose"
          style={[styles.segment, mode === "glucose" && styles.segmentActive]}
          onPress={() => setMode("glucose")}
        >
          <Activity size={16} color={mode === "glucose" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
          <Text style={[styles.segmentTxt, mode === "glucose" && styles.segmentTxtActive]}>Glucose</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="hist-tab-bp"
          style={[styles.segment, mode === "bp" && styles.segmentActive]}
          onPress={() => setMode("bp")}
        >
          <HeartPulse size={16} color={mode === "bp" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
          <Text style={[styles.segmentTxt, mode === "bp" && styles.segmentTxtActive]}>Blood Pressure</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      >
        <View style={styles.chartCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.chartLabel}>
              {mode === "glucose" ? "Glucose (mmol/L)" : "Systolic (mmHg)"}
            </Text>
            <Text style={styles.rangeLabel}>last {mode === "glucose" ? glucoseChartValues.length : bpSysValues.length}</Text>
          </View>
          {mode === "glucose" ? (
            <MiniLineChart
              testID="glucose-chart"
              values={glucoseChartValues}
              rangeMin={4.0}
              rangeMax={10.0}
            />
          ) : (
            <MiniLineChart
              testID="bp-chart"
              values={bpSysValues}
              rangeMin={90}
              rangeMax={120}
            />
          )}
          <Text style={styles.chartCaption}>
            {mode === "glucose" ? "Shaded band = typical in-range (4.0–10.0)" : "Shaded band = normal systolic (90–120)"}
          </Text>
        </View>

        <Text style={styles.listTitle}>Readings</Text>

        {(mode === "glucose" ? gq.isLoading : bq.isLoading) ? (
          <ActivityIndicator color={colors.brand} />
        ) : null}

        {mode === "glucose" ? (
          glucoseData.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyTxt}>No glucose readings yet.</Text></View>
          ) : (
            glucoseData.map((g: any) => (
              <View key={g.id} style={styles.row} testID={`glucose-row-${g.id}`}>
                <View style={[styles.statusDot, { backgroundColor: severityColor(g.severity, colors) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowValue}>{g.value} <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "500" }}>mmol/L</Text></Text>
                  <Text style={styles.rowSub}>{contextLabels[g.context] || g.context} · {fmtDate(g.timestamp)} · {g.label}</Text>
                </View>
                <TouchableOpacity testID={`delete-glucose-${g.id}`} style={styles.deleteBtn} onPress={() => delG.mutate(g.id)}>
                  <Trash2 size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))
          )
        ) : (
          bpData.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyTxt}>No BP readings yet.</Text></View>
          ) : (
            bpData.map((b: any) => (
              <View key={b.id} style={styles.row} testID={`bp-row-${b.id}`}>
                <View style={[styles.statusDot, { backgroundColor: severityColor(b.severity, colors) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowValue}>{b.systolic}/{b.diastolic} <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "500" }}>mmHg</Text></Text>
                  <Text style={styles.rowSub}>{b.pulse ? `${b.pulse} bpm · ` : ""}{fmtDate(b.timestamp)} · {b.label}</Text>
                </View>
                <TouchableOpacity testID={`delete-bp-${b.id}`} style={styles.deleteBtn} onPress={() => delB.mutate(b.id)}>
                  <Trash2 size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))
          )
        )}
      </ScrollView>
    </View>
  );
}
