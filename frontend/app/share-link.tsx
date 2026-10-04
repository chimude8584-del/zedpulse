import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Link2, Share2, Copy, XCircle, Clock } from "lucide-react-native";

import { api, PUBLIC_BASE } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { fmtDate } from "@/src/utils/format";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  subtitle: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.lg },
  card: { marginHorizontal: spacing.xl, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: c.brandSecondary },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.onBrandSecondary },
  urlBox: { marginTop: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  urlTxt: { fontSize: 13, color: c.onSurface, fontFamily: "monospace" },
  expiry: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  expiryTxt: { fontSize: 12, color: c.onBrandSecondary, opacity: 0.8 },
  actions: { marginTop: spacing.lg, flexDirection: "row", gap: spacing.md },
  primary: { flex: 1, backgroundColor: c.brandPrimary, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  primaryTxt: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  secondary: { flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  secondaryTxt: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  danger: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  dangerTxt: { color: c.error, fontSize: 14, fontWeight: "600" },
  empty: { marginHorizontal: spacing.xl, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: c.onSurface, marginTop: spacing.sm },
  emptyTxt: { fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 20 },
  createBtn: { marginTop: spacing.lg, backgroundColor: c.brandPrimary, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.xl, alignItems: "center", flexDirection: "row", gap: 6 },
  createBtnTxt: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  helper: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  helperTxt: { fontSize: 12, color: c.onBrandTertiary, lineHeight: 18 },
}));

export default function ShareLink() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const q = useQuery({ queryKey: ["share-current"], queryFn: () => api.shareCurrent() });
  const createMut = useMutation({
    mutationFn: () => api.shareCreate(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["share-current"] }),
  });
  const revokeMut = useMutation({
    mutationFn: () => api.shareRevoke(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["share-current"] }),
  });

  const token = q.data?.token;
  const url = token ? `${PUBLIC_BASE}/api/share/${token}` : null;

  async function copyUrl() {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function shareUrl() {
    if (!url) return;
    try {
      await Share.share({ message: `My VitaTrack readings (read-only, expires in 7 days):\n${url}`, url });
    } catch {}
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="share-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Doctor share link</Text>
      </View>
      <Text style={styles.subtitle}>A private read-only web page for your clinician. Expires after 7 days.</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {q.isLoading ? (
          <ActivityIndicator color={colors.brand} />
        ) : url ? (
          <>
            <View style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Link2 size={18} color={colors.onBrandSecondary} />
                <Text style={styles.cardTitle}>Active link</Text>
              </View>
              <View style={styles.urlBox}>
                <Text style={styles.urlTxt} selectable testID="share-url">{url}</Text>
              </View>
              <View style={styles.expiry}>
                <Clock size={14} color={colors.onBrandSecondary} />
                <Text style={styles.expiryTxt}>Expires {fmtDate(q.data?.expires_at)}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity testID="share-send" style={styles.primary} onPress={shareUrl}>
                  <Share2 size={14} color={colors.onBrandPrimary} />
                  <Text style={styles.primaryTxt}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="share-copy" style={styles.secondary} onPress={copyUrl}>
                  <Copy size={14} color={colors.onSurface} />
                  <Text style={styles.secondaryTxt}>{copied ? "Copied!" : "Copy"}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity testID="share-revoke" style={styles.danger} onPress={() => revokeMut.mutate()}>
              <XCircle size={16} color={colors.error} />
              <Text style={styles.dangerTxt}>Revoke link</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.empty}>
            <Link2 size={32} color={colors.muted} />
            <Text style={styles.emptyTitle}>No active link</Text>
            <Text style={styles.emptyTxt}>Create a 7-day link your doctor can open in any browser — no app or login needed.</Text>
            <TouchableOpacity testID="share-create" style={styles.createBtn} onPress={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <>
                  <Link2 size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.createBtnTxt}>Create link</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.helper}>
          <Text style={styles.helperTxt}>
            The link shows your latest 100 glucose and BP readings. Revoke anytime — new link invalidates the old one.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
