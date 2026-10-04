import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Share, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Share2, Copy, FileDown } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  back: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border,
  },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  reportBox: {
    marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  reportTxt: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 12, color: c.onSurface, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  primary: {
    flex: 1, backgroundColor: c.brandPrimary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6,
  },
  primaryTxt: { color: c.onBrandPrimary, fontSize: 15, fontWeight: "600" },
  secondary: {
    flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingVertical: 14, alignItems: "center",
    flexDirection: "row", justifyContent: "center", gap: 6,
  },
  secondaryTxt: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  helper: { paddingHorizontal: spacing.xl, marginTop: spacing.sm, fontSize: 12, color: c.muted },
}));

export default function Report() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.report();
        setText(r.text);
      } catch (e: any) {
        setText(`Failed to load report: ${e.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function share() {
    try {
      await Share.share({ message: text, title: "Health report" });
    } catch {}
  }
  async function copy() {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function exportPDF() {
    const html = `<!doctype html><html><head><meta charset='utf-8'>
      <style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 32px; color:#1C2420; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color:#6B766F; font-size:12px; margin-bottom:16px; }
        pre { background:#F1EFE8; padding:16px; border-radius:8px; font-size:11px; line-height:1.5; white-space:pre-wrap; }
      </style></head><body>
      <h1>ZedPulse — Health Report</h1>
      <div class='sub'>Generated via ZedPulse mobile app · Zambia</div>
      <pre>${text.replace(/</g, "&lt;")}</pre>
    </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "VitaTrack report" });
      } else {
        await Share.share({ url: uri, message: "VitaTrack report" });
      }
    } catch (e: any) {
      console.warn("PDF export failed", e);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="report-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Doctor report</Text>
      </View>
      <Text style={styles.helper}>Share this with your clinician. All your readings, no cherry-picking.</Text>

      <ScrollView contentContainerStyle={{ paddingVertical: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <View style={styles.reportBox} testID="report-text-box">
            <Text style={styles.reportTxt} selectable>{text}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity testID="report-pdf" style={styles.primary} onPress={exportPDF}>
            <FileDown size={16} color={colors.onBrandPrimary} />
            <Text style={styles.primaryTxt}>Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="report-share" style={styles.secondary} onPress={share}>
            <Share2 size={16} color={colors.onSurface} />
            <Text style={styles.secondaryTxt}>Share text</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.actions, { marginTop: spacing.sm }]}>
          <TouchableOpacity testID="report-copy" style={styles.secondary} onPress={copy}>
            <Copy size={16} color={colors.onSurface} />
            <Text style={styles.secondaryTxt}>{copied ? "Copied!" : "Copy text"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
