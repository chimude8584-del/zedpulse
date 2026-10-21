import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users, UserPlus, Copy, Share2, Trash2, Eye, User, Clock } from "lucide-react-native";

import { api } from "@/src/api";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },

  tabRow: { flexDirection: "row", marginHorizontal: spacing.xl, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: c.border, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  tabActive: { backgroundColor: c.brand },
  tabTxt: { fontSize: 13, fontWeight: "700", color: c.onSurfaceTertiary },
  tabTxtActive: { color: c.onBrand },

  intro: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },

  inviteCard: { marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.brandSecondary, borderWidth: 1, borderColor: c.brand, gap: spacing.md },
  inviteHeading: { fontSize: 16, fontWeight: "800", color: c.onBrandSecondary },
  codeBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 2, borderColor: c.brand, borderStyle: "dashed", paddingVertical: 14, paddingHorizontal: spacing.lg, justifyContent: "center" },
  codeTxt: { fontSize: 24, fontWeight: "900", color: c.brand, letterSpacing: 4, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },

  shareBtn: { backgroundColor: "#25D366", borderRadius: radius.md, paddingVertical: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  shareTxt: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  genBtn: { marginHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.brand, borderStyle: "dashed", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: c.surface },
  genTxt: { color: c.brand, fontWeight: "700" },

  expiry: { fontSize: 11, color: c.onBrandSecondary, opacity: 0.75, textAlign: "center" },

  listCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  listTitle: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  rowFirst: { borderTopWidth: 0 },
  name: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  iconBtn: { padding: 8 },

  empty: { color: c.muted, fontSize: 13, textAlign: "center", padding: spacing.md, fontStyle: "italic" },

  acceptCard: { marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  input: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 18, color: c.onSurface, letterSpacing: 3, textAlign: "center", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  acceptBtn: { marginTop: spacing.sm, backgroundColor: c.brand, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  acceptBtnTxt: { color: c.onBrand, fontSize: 15, fontWeight: "700" },
}));

type Tab = "mine" | "patients";

export default function Caregivers() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("mine");
  const [code, setCode] = useState("");

  const caregiversQ = useQuery({ queryKey: ["my-caregivers"], queryFn: () => api.myCaregivers() });
  const patientsQ = useQuery({ queryKey: ["my-patients"], queryFn: () => api.myPatients() });

  const [invite, setInvite] = useState<{ code: string; expires_at: string; share_text: string } | null>(null);

  const inviteMut = useMutation({
    mutationFn: () => api.caregiverInvite(),
    onSuccess: (d) => setInvite(d),
    onError: (e: any) => Alert.alert(t("Error"), e?.message || "Could not create invite"),
  });

  const acceptMut = useMutation({
    mutationFn: (c: string) => api.caregiverAccept(c),
    onSuccess: (d: any) => {
      Alert.alert(t("Linked ✓"), d?.patient_name ? `${t("Linked successfully.")} ${d.patient_name}` : t("Linked successfully."));
      setCode("");
      qc.invalidateQueries({ queryKey: ["my-patients"] });
      setTab("patients");
    },
    onError: (e: any) => Alert.alert(t("Could not link"), e?.message || t("Check the code and try again.")),
  });

  const unlinkMut = useMutation({
    mutationFn: (id: string) => api.unlinkCaregiver(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-caregivers"] });
      qc.invalidateQueries({ queryKey: ["my-patients"] });
    },
    onError: (e: any) => Alert.alert(t("Error"), e?.message || "Could not unlink"),
  });

  async function copyCode() {
    if (!invite?.code) return;
    try {
      await Clipboard.setStringAsync(invite.code);
      Alert.alert(t("Copied"), `Code ${invite.code} copied.`);
    } catch {}
  }

  function shareWA() {
    if (!invite?.share_text) return;
    const url = `https://wa.me/?text=${encodeURIComponent(invite.share_text)}`;
    Linking.openURL(url).catch(() => Alert.alert("WhatsApp not available"));
  }

  function confirmUnlink(l: any, label: string) {
    Alert.alert(
      t("Remove link?"),
      `${label} ${t("will no longer see or share health data.")}`,
      [
        { text: t("Cancel"), style: "cancel" },
        { text: t("Remove"), style: "destructive", onPress: () => unlinkMut.mutate(l.id) },
      ],
    );
  }

  function fmtDate(iso?: string) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-ZM", { day: "numeric", month: "short" }); } catch { return ""; }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="cg-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>{t("Family & caregivers")}</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity testID="cg-tab-mine" style={[styles.tab, tab === "mine" && styles.tabActive]} onPress={() => setTab("mine")}>
          <Text style={[styles.tabTxt, tab === "mine" && styles.tabTxtActive]}>{t("Watching me")}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="cg-tab-patients" style={[styles.tab, tab === "patients" && styles.tabActive]} onPress={() => setTab("patients")}>
          <Text style={[styles.tabTxt, tab === "patients" && styles.tabTxtActive]}>{t("People I watch")}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {tab === "mine" ? (
          <>
            <Text style={styles.intro}>
              {t("Share a 7-day invite code so a spouse, parent, or adult child can view your glucose and BP readings. They'll need the ZedPulse app installed.")}
            </Text>

            {invite ? (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteHeading}>{t("Your invite code")}</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeTxt} testID="cg-invite-code">{invite.code}</Text>
                  <TouchableOpacity testID="cg-copy" onPress={copyCode}><Copy size={18} color={colors.brand} /></TouchableOpacity>
                </View>
                <Text style={styles.expiry}>{t("Expires")} {fmtDate(invite.expires_at)}</Text>
                <TouchableOpacity testID="cg-share-wa" style={styles.shareBtn} onPress={shareWA}>
                  <Share2 size={16} color="#FFFFFF" />
                  <Text style={styles.shareTxt}>{t("Share invite on WhatsApp")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity testID="cg-gen" style={styles.genBtn} onPress={() => inviteMut.mutate()} disabled={inviteMut.isPending}>
                {inviteMut.isPending ? <ActivityIndicator color={colors.brand} /> : <>
                  <UserPlus size={16} color={colors.brand} />
                  <Text style={styles.genTxt}>{t("Invite a caregiver")}</Text>
                </>}
              </TouchableOpacity>
            )}

            <View style={styles.listCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Users size={14} color={colors.brand} />
                <Text style={styles.listTitle}>{t("People watching you")}</Text>
              </View>
              {caregiversQ.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
              {caregiversQ.data?.length ? (
                caregiversQ.data.map((l: any, i: number) => (
                  <View key={l.id} style={[styles.row, i === 0 && styles.rowFirst]} testID={`cg-row-${i}`}>
                    <User size={18} color={colors.brand} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{l.caregiver_name || t("Caregiver")}</Text>
                      <Text style={styles.sub}>{l.caregiver_phone || ""} · {t("linked")} {fmtDate(l.created_at)}</Text>
                    </View>
                    <TouchableOpacity testID={`cg-unlink-${i}`} style={styles.iconBtn} onPress={() => confirmUnlink(l, l.caregiver_name || "This caregiver")}>
                      <Trash2 size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                !caregiversQ.isLoading && <Text style={styles.empty}>{t("No caregivers yet.")}</Text>
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.intro}>
              {t("Enter an 8-character invite code from a family member to view their readings in a safe, read-only way.")}
            </Text>

            <View style={styles.acceptCard}>
              <TextInput
                testID="cg-code-input"
                style={styles.input}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="XXXXXXXX"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                maxLength={8}
              />
              <TouchableOpacity
                testID="cg-accept"
                style={styles.acceptBtn}
                onPress={() => acceptMut.mutate(code.trim())}
                disabled={acceptMut.isPending || !code.trim()}
              >
                {acceptMut.isPending ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.acceptBtnTxt}>{t("Link account")}</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.listCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Eye size={14} color={colors.brand} />
                <Text style={styles.listTitle}>{t("Patients you watch")}</Text>
              </View>
              {patientsQ.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
              {patientsQ.data?.length ? (
                patientsQ.data.map((p: any, i: number) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.row, i === 0 && styles.rowFirst]}
                    testID={`patient-row-${i}`}
                    onPress={() => router.push({ pathname: "/caregiver-view", params: { pid: p.patient_user_id, name: p.patient_name || "Patient" } })}
                  >
                    <User size={18} color={colors.brand} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{p.patient_name || t("Patient")}</Text>
                      <Text style={styles.sub}>{p.patient_phone || ""} · {t("linked")} {fmtDate(p.created_at)}</Text>
                    </View>
                    <TouchableOpacity testID={`patient-unlink-${i}`} style={styles.iconBtn} onPress={() => confirmUnlink(p, p.patient_name || "This patient")}>
                      <Trash2 size={16} color={colors.error} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              ) : (
                !patientsQ.isLoading && <Text style={styles.empty}>{t("No linked patients yet. Ask them for an invite code.")}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
