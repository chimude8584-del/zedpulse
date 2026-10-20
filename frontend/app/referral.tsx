import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Alert, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Share2, Copy, CheckCircle2, Gift, Users, Crown } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  hero: {
    marginHorizontal: spacing.xl, padding: spacing.xl, borderRadius: radius.lg,
    backgroundColor: c.brandSecondary, borderWidth: 1, borderColor: c.brand, alignItems: "center",
  },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: c.brand,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: c.onBrandSecondary, textAlign: "center" },
  heroSub: { fontSize: 14, color: c.onBrandSecondary, textAlign: "center", marginTop: 6, lineHeight: 20, opacity: 0.85 },
  codeBox: {
    marginTop: spacing.lg, backgroundColor: c.surface, borderRadius: radius.md,
    paddingVertical: 14, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 2, borderColor: c.brand, borderStyle: "dashed",
  },
  codeTxt: { fontSize: 28, fontWeight: "900", color: c.brand, letterSpacing: 6, fontVariant: ["tabular-nums"], fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  copyBtn: { padding: 6 },

  shareBtn: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    backgroundColor: "#25D366", borderRadius: radius.md, paddingVertical: 16,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10,
  },
  shareTxt: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  shareOtherBtn: {
    marginHorizontal: spacing.xl, marginTop: spacing.sm,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingVertical: 14,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
  },
  shareOtherTxt: { color: c.onSurface, fontSize: 15, fontWeight: "600" },

  statsRow: { flexDirection: "row", marginHorizontal: spacing.xl, marginTop: spacing.lg, gap: spacing.md },
  statCard: { flex: 1, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center" },
  statIcon: { marginBottom: 6 },
  statVal: { fontSize: 22, fontWeight: "800", color: c.onSurface, fontVariant: ["tabular-nums"] },
  statLbl: { fontSize: 11, color: c.muted, marginTop: 2, textAlign: "center", fontWeight: "600" },

  proBanner: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.warning + "22", borderWidth: 1, borderColor: c.warning,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  proTitle: { fontSize: 14, fontWeight: "800", color: c.warning },
  proSub: { fontSize: 12, color: c.onSurfaceTertiary, marginTop: 2 },

  howCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  howTitle: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
  stepRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", marginBottom: spacing.md },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: c.brand,
    alignItems: "center", justifyContent: "center",
  },
  stepNumTxt: { fontSize: 12, color: c.onBrand, fontWeight: "800" },
  stepTxt: { flex: 1, fontSize: 14, color: c.onSurface, lineHeight: 20 },
}));

export default function Referral() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const refQ = useQuery({ queryKey: ["my-referral"], queryFn: () => api.myReferral() });

  async function copyCode() {
    if (!refQ.data?.code) return;
    try {
      await Clipboard.setStringAsync(refQ.data.code);
      Alert.alert("Copied!", `Code ${refQ.data.code} copied to clipboard.`);
    } catch {
      // noop
    }
  }

  function shareWhatsApp() {
    if (!refQ.data?.share_text) return;
    const text = encodeURIComponent(refQ.data.share_text);
    Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {
      Alert.alert("WhatsApp not available", "Please install WhatsApp to share.");
    });
  }

  function shareOther() {
    if (!refQ.data?.share_text) return;
    const text = encodeURIComponent(refQ.data.share_text);
    Linking.openURL(`sms:?body=${text}`).catch(() => {});
  }

  function formatProDate(iso: string | null | undefined): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-ZM", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "";
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="ref-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Invite friends</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {refQ.isLoading ? (
          <ActivityIndicator color={colors.brand} />
        ) : refQ.data ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Gift size={28} color={colors.onBrand} />
              </View>
              <Text style={styles.heroTitle}>Give 7 days, get 7 days 🎁</Text>
              <Text style={styles.heroSub}>
                Share your code with family and friends. When they sign up, you both get 7 days of ZedPulse Pro — free.
              </Text>

              <View style={styles.codeBox}>
                <Text style={styles.codeTxt} testID="ref-code">{refQ.data.code}</Text>
                <TouchableOpacity testID="ref-copy" style={styles.copyBtn} onPress={copyCode}>
                  <Copy size={20} color={colors.brand} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity testID="ref-share-wa" style={styles.shareBtn} onPress={shareWhatsApp}>
              <Share2 size={18} color="#FFFFFF" />
              <Text style={styles.shareTxt}>Share on WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity testID="ref-share-sms" style={styles.shareOtherBtn} onPress={shareOther}>
              <Share2 size={16} color={colors.onSurface} />
              <Text style={styles.shareOtherTxt}>Share via SMS</Text>
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Users size={20} color={colors.brand} style={styles.statIcon} />
                <Text style={styles.statVal} testID="ref-invites">{refQ.data.invites_count}</Text>
                <Text style={styles.statLbl}>friends joined</Text>
              </View>
              <View style={styles.statCard}>
                <CheckCircle2 size={20} color={colors.success} style={styles.statIcon} />
                <Text style={styles.statVal}>{refQ.data.invites_count * 7}</Text>
                <Text style={styles.statLbl}>Pro days earned</Text>
              </View>
            </View>

            {refQ.data.is_pro ? (
              <View style={styles.proBanner} testID="ref-pro-banner">
                <Crown size={22} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.proTitle}>You're ZedPulse Pro</Text>
                  <Text style={styles.proSub}>Active until {formatProDate(refQ.data.pro_until)}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.howCard}>
              <Text style={styles.howTitle}>How it works</Text>
              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumTxt}>1</Text></View>
                <Text style={styles.stepTxt}>Share your code with a friend who has diabetes or high BP.</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumTxt}>2</Text></View>
                <Text style={styles.stepTxt}>They enter it when creating a ZedPulse account.</Text>
              </View>
              <View style={[styles.stepRow, { marginBottom: 0 }]}>
                <View style={styles.stepNum}><Text style={styles.stepNumTxt}>3</Text></View>
                <Text style={styles.stepTxt}>You both get 7 days of Pro — stack more days with every new friend!</Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
