import { useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { ArrowLeft, Share2, Activity, HeartPulse, Flame, CheckCircle2, Download } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  intro: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },

  cardWrap: { paddingHorizontal: spacing.xl, alignItems: "center" },
  card: {
    width: 320,
    backgroundColor: c.brand,
    borderRadius: 20,
    padding: 22,
    gap: 14,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandLogoBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.onBrand, alignItems: "center", justifyContent: "center" },
  brandLogoTxt: { color: c.brand, fontWeight: "800", fontSize: 15 },
  brandName: { color: c.onBrand, fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  brandFlag: { color: c.onBrand, fontSize: 14, marginLeft: "auto" },

  weekLabel: { color: c.onBrand, opacity: 0.75, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  nameLine: { color: c.onBrand, fontSize: 20, fontWeight: "800" },
  summaryLine: { color: c.onBrand, fontSize: 13, opacity: 0.85, lineHeight: 18 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  stat: {
    width: "47%",
    backgroundColor: c.onBrand + "22",
    borderRadius: 14,
    padding: 12,
  },
  statLabel: { color: c.onBrand, fontSize: 10, opacity: 0.75, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 },
  statValue: { color: c.onBrand, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 2 },
  statUnit: { color: c.onBrand, fontSize: 11, opacity: 0.75, fontWeight: "600" },

  footerLine: { color: c.onBrand, fontSize: 12, opacity: 0.9, textAlign: "center", marginTop: 8, fontWeight: "600" },

  shareBtn: {
    marginHorizontal: spacing.xl, marginTop: spacing.xl,
    backgroundColor: "#25D366", borderRadius: radius.md, paddingVertical: 16,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10,
  },
  shareTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  dlBtn: {
    marginHorizontal: spacing.xl, marginTop: spacing.sm,
    backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingVertical: 14,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: c.border,
  },
  dlTxt: { color: c.onSurface, fontSize: 15, fontWeight: "600" },

  disclaimer: { marginTop: spacing.lg, marginHorizontal: spacing.xl, fontSize: 11, color: c.muted, textAlign: "center" },
}));

function formatRange(start?: string, end?: string): string {
  if (!start || !end) return "This week";
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${s.toLocaleDateString("en-ZM", opts)} – ${e.toLocaleDateString("en-ZM", opts)}`;
  } catch {
    return "This week";
  }
}

export default function ShareWeek() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cardRef = useRef<any>(null);

  const q = useQuery({ queryKey: ["share-weekly"], queryFn: () => api.shareWeekly() });

  async function doShare() {
    try {
      if (!cardRef.current) return;
      const uri = await captureRef(cardRef, { format: "png", quality: 0.95, result: "tmpfile" });
      if (Platform.OS === "web") {
        // Web fallback: open in new tab
        try {
          const resp = await fetch(uri);
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          return;
        } catch (e) {
          Alert.alert("Share", "Long-press the image to save or share.");
          return;
        }
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing not available", "Please install WhatsApp or another sharing app.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share my ZedPulse week",
      });
    } catch (e: any) {
      Alert.alert("Could not share", e?.message || "Please try again.");
    }
  }

  const d = q.data;
  const inRangeTxt = d?.glucose_in_range_pct != null ? `${d.glucose_in_range_pct}%` : "–";
  const streakTxt = (d?.log_days ?? 0).toString();
  const avgG = d?.glucose_avg != null ? d.glucose_avg.toFixed(1) : "–";
  const avgBp = d?.bp_avg_systolic && d?.bp_avg_diastolic ? `${d.bp_avg_systolic}/${d.bp_avg_diastolic}` : "–";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="sw-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Share your week</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <Text style={styles.intro}>
          A beautiful summary of your last 7 days. Share it on WhatsApp status so friends and family can cheer you on 🎉
        </Text>

        {q.isLoading ? (
          <ActivityIndicator color={colors.brand} />
        ) : d ? (
          <View style={styles.cardWrap}>
            <ViewShot ref={cardRef} options={{ format: "png", quality: 0.95 }}>
              <View style={styles.card} testID="share-card">
                <View style={styles.brandRow}>
                  <View style={styles.brandLogoBox}>
                    <Text style={styles.brandLogoTxt}>Z</Text>
                  </View>
                  <Text style={styles.brandName}>ZedPulse</Text>
                  <Text style={styles.brandFlag}>🇿🇲</Text>
                </View>

                <View>
                  <Text style={styles.weekLabel}>My week · {formatRange(d.week_start, d.week_end)}</Text>
                  <Text style={styles.nameLine}>{d.name ? `${d.name}'s health, in numbers.` : "My health, in numbers."}</Text>
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.stat}>
                    <CheckCircle2 size={16} color={colors.onBrand} />
                    <Text style={styles.statLabel}>In range</Text>
                    <Text style={styles.statValue}>{inRangeTxt}</Text>
                    <Text style={styles.statUnit}>{d.glucose_count || 0} glucose checks</Text>
                  </View>
                  <View style={styles.stat}>
                    <Flame size={16} color={colors.onBrand} />
                    <Text style={styles.statLabel}>Logging days</Text>
                    <Text style={styles.statValue}>{streakTxt}<Text style={styles.statUnit}>/7</Text></Text>
                    <Text style={styles.statUnit}>days with data</Text>
                  </View>
                  <View style={styles.stat}>
                    <Activity size={16} color={colors.onBrand} />
                    <Text style={styles.statLabel}>Avg glucose</Text>
                    <Text style={styles.statValue}>{avgG}<Text style={styles.statUnit}> mmol/L</Text></Text>
                    <Text style={styles.statUnit}>{d.hypos_count ? `${d.hypos_count} lows` : "no lows"}</Text>
                  </View>
                  <View style={styles.stat}>
                    <HeartPulse size={16} color={colors.onBrand} />
                    <Text style={styles.statLabel}>Avg BP</Text>
                    <Text style={styles.statValue}>{avgBp}</Text>
                    <Text style={styles.statUnit}>{d.bp_count || 0} readings</Text>
                  </View>
                </View>

                <Text style={styles.summaryLine}>{d.encouragement}</Text>
                <Text style={styles.footerLine}>Track your diabetes & BP · zedpulse.app</Text>
              </View>
            </ViewShot>
          </View>
        ) : null}

        <TouchableOpacity testID="sw-share" style={styles.shareBtn} onPress={doShare}>
          <Share2 size={18} color="#FFFFFF" />
          <Text style={styles.shareTxt}>Share on WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="sw-save" style={styles.dlBtn} onPress={doShare}>
          <Download size={16} color={colors.onSurface} />
          <Text style={styles.dlTxt}>Save or share elsewhere</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>Your name and numbers appear on the card. We don't share anything without your action.</Text>
      </ScrollView>
    </View>
  );
}
