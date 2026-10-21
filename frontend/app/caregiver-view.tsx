import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Droplet, HeartPulse, Phone, AlertTriangle } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  subtitle: { fontSize: 12, color: c.muted },
  callBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", gap: spacing.md, marginHorizontal: spacing.xl, marginBottom: spacing.md },
  summary: { flex: 1, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 4 },
  sumLabel: { fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  sumValue: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  sumUnit: { fontSize: 12, color: c.muted },
  alert: { marginHorizontal: spacing.xl, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.error, backgroundColor: c.surfaceSecondary, flexDirection: "row", gap: 8, alignItems: "center" },
  alertTxt: { flex: 1, color: c.error, fontSize: 13, fontWeight: "600" },
  card: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  cardTitle: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  val: { fontSize: 16, fontWeight: "700", color: c.onSurface, width: 90 },
  meta: { flex: 1, fontSize: 12, color: c.muted },
  tag: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden" },
  empty: { color: c.muted, fontSize: 13, fontStyle: "italic", paddingTop: spacing.sm },
  readOnly: { textAlign: "center", color: c.muted, fontSize: 11, marginTop: spacing.lg },
}));

function fmt(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-ZM", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function isGlucoseAlert(g: any) {
  return g && (g.value < 4 || g.value > 13.9);
}
function isBpAlert(b: any) {
  return b && (b.systolic >= 180 || b.diastolic >= 120 || b.systolic < 90);
}

export default function CaregiverView() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pid, name } = useLocalSearchParams<{ pid: string; name?: string }>();

  const q = useQuery({ queryKey: ["cg-readings", pid], queryFn: () => api.caregiverReadings(String(pid)), enabled: !!pid });
  const glucose = q.data?.glucose || [];
  const bp = q.data?.bp || [];
  const lastG = glucose[0];
  const lastB = bp[0];
  const displayName = q.data?.patient_name || name || "Patient";

  function tagStyle(bad: boolean) {
    return { backgroundColor: bad ? colors.error : colors.brandSecondary, color: bad ? colors.onError : colors.onBrandSecondary };
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="cgv-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} testID="cgv-name">{displayName}</Text>
          <Text style={styles.subtitle}>Last 14 days · read-only</Text>
        </View>
        {q.data?.patient_phone ? (
          <TouchableOpacity testID="cgv-call" style={styles.callBtn} onPress={() => Linking.openURL(`tel:${q.data?.patient_phone}`)}>
            <Phone size={18} color={colors.onBrand} />
          </TouchableOpacity>
        ) : null}
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brand} />
      ) : q.isError ? (
        <Text style={[styles.empty, { textAlign: "center", padding: spacing.xl }]}>
          Could not load readings. The link may have been removed.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.brand} />}
        >
          {(isGlucoseAlert(lastG) || isBpAlert(lastB)) && (
            <View style={styles.alert} testID="cgv-alert">
              <AlertTriangle size={18} color={colors.error} />
              <Text style={styles.alertTxt}>
                Latest reading is outside the safe range. Check on {displayName} — call them or take them to the nearest clinic if unwell.
              </Text>
            </View>
          )}

          <View style={styles.summaryRow}>
            <View style={styles.summary}>
              <Text style={styles.sumLabel}>Last glucose</Text>
              <Text style={styles.sumValue}>{lastG ? lastG.value.toFixed(1) : "—"}</Text>
              <Text style={styles.sumUnit}>mmol/L {lastG ? `· ${fmt(lastG.timestamp)}` : ""}</Text>
            </View>
            <View style={styles.summary}>
              <Text style={styles.sumLabel}>Last BP</Text>
              <Text style={styles.sumValue}>{lastB ? `${lastB.systolic}/${lastB.diastolic}` : "—"}</Text>
              <Text style={styles.sumUnit}>mmHg {lastB ? `· ${fmt(lastB.timestamp)}` : ""}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: spacing.sm }}>
              <Droplet size={14} color={colors.brand} />
              <Text style={styles.cardTitle}>Blood sugar ({glucose.length})</Text>
            </View>
            {glucose.length ? glucose.map((g: any, i: number) => (
              <View key={g.id || i} style={styles.row} testID={`cgv-g-${i}`}>
                <Text style={styles.val}>{Number(g.value).toFixed(1)}</Text>
                <Text style={styles.meta}>{fmt(g.timestamp)} · {String(g.context || "").replace("_", " ")}</Text>
                {g.label ? <Text style={[styles.tag, tagStyle(isGlucoseAlert(g))]}>{g.label}</Text> : null}
              </View>
            )) : <Text style={styles.empty}>No glucose readings in the last 14 days.</Text>}
          </View>

          <View style={styles.card}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: spacing.sm }}>
              <HeartPulse size={14} color={colors.brand} />
              <Text style={styles.cardTitle}>Blood pressure ({bp.length})</Text>
            </View>
            {bp.length ? bp.map((b: any, i: number) => (
              <View key={b.id || i} style={styles.row} testID={`cgv-bp-${i}`}>
                <Text style={styles.val}>{b.systolic}/{b.diastolic}</Text>
                <Text style={styles.meta}>{fmt(b.timestamp)}{b.pulse ? ` · pulse ${b.pulse}` : ""}</Text>
                {b.label ? <Text style={[styles.tag, tagStyle(isBpAlert(b))]}>{b.label}</Text> : null}
              </View>
            )) : <Text style={styles.empty}>No BP readings in the last 14 days.</Text>}
          </View>

          <Text style={styles.readOnly}>{`You can view but not change ${displayName}'s readings.`}</Text>
        </ScrollView>
      )}
    </View>
  );
}
