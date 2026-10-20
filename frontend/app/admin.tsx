import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, X, Edit3, Trash2, Plus, Phone, MessageCircle, Shield, Users, Pill, Clock } from "lucide-react-native";

import { api } from "@/src/api";
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
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  name: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  note: { fontSize: 12, color: c.muted, marginTop: 4, lineHeight: 16 },
  contactChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  contactTxt: { fontSize: 12, color: c.onSurfaceTertiary, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  actionRow: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
  approveBtn: { backgroundColor: c.success, borderColor: c.success },
  approveTxt: { color: c.onSuccess, fontSize: 13, fontWeight: "700" },
  rejectBtn: { backgroundColor: c.surface, borderColor: c.error },
  rejectTxt: { color: c.error, fontSize: 13, fontWeight: "700" },
  editBtn: { backgroundColor: c.surface, borderColor: c.brand },
  editTxt: { color: c.brand, fontSize: 13, fontWeight: "700" },
  delBtn: { backgroundColor: c.surface, borderColor: c.error },
  delTxt: { color: c.error, fontSize: 13, fontWeight: "700" },
  addBtn: { marginHorizontal: spacing.xl, marginBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.brand, borderStyle: "dashed", backgroundColor: c.surface },
  addTxt: { fontSize: 14, fontWeight: "700", color: c.brand },
  empty: { color: c.muted, fontSize: 14, textAlign: "center", padding: spacing.xl, fontStyle: "italic" },
  // Stats
  statsGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.md },
  statCard: { width: "47%", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.brandSecondary, borderWidth: 1, borderColor: c.brand },
  statIcon: { marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: "800", color: c.onBrandSecondary, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 12, color: c.onBrandSecondary, opacity: 0.75, marginTop: 2, fontWeight: "600" },
  // Modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  label: { fontSize: 12, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: c.onSurface },
  modalBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: "center" },
  modalCancel: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  modalCancelTxt: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  modalSave: { backgroundColor: c.brand },
  modalSaveTxt: { fontSize: 14, fontWeight: "700", color: c.onBrand },
}));

type Tab = "submissions" | "pharmacies" | "stats";

export default function Admin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("submissions");
  const [editing, setEditing] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

  // Guard: only admin
  const isAdmin = meQ.data?.role === "admin";

  const subsQ = useQuery({ queryKey: ["admin-subs"], queryFn: () => api.adminSubmissions("pending"), enabled: isAdmin });
  const pharmsQ = useQuery({ queryKey: ["admin-pharms"], queryFn: () => api.adminListPharmacies(), enabled: isAdmin });
  const statsQ = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.adminStats(), enabled: isAdmin });

  const approveMut = useMutation({
    mutationFn: (id: string) => api.adminApprove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
      qc.invalidateQueries({ queryKey: ["admin-pharms"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-stockists"] });
    },
    onError: (e: any) => Alert.alert("Error", e?.message || "Could not approve"),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => api.adminReject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e: any) => Alert.alert("Error", e?.message || "Could not reject"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeletePharmacy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pharms"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-stockists"] });
    },
    onError: (e: any) => Alert.alert("Error", e?.message || "Could not delete"),
  });

  if (meQ.isLoading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.title}>Admin</Text>
        </View>
        <Text style={styles.empty}>Access denied. Admin only.</Text>
      </View>
    );
  }

  function confirmDelete(p: any) {
    Alert.alert("Delete pharmacy?", `Remove "${p.name}"? Users will no longer see it.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(p.id) },
    ]);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="admin-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Admin</Text>
        <Shield size={22} color={colors.brand} />
      </View>

      <View style={styles.tabRow}>
        {(["submissions", "pharmacies", "stats"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            testID={`admin-tab-${t}`}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === "submissions" ? `Pending${subsQ.data?.length ? ` (${subsQ.data.length})` : ""}` : t === "pharmacies" ? "Pharmacies" : "Stats"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {tab === "submissions" && (
          <>
            {subsQ.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
            {subsQ.data?.length ? (
              subsQ.data.map((s: any) => (
                <View key={s.id} style={styles.card} testID={`sub-${s.id}`}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{s.name}</Text>
                      {s.note ? <Text style={styles.note}>{s.note}</Text> : null}
                      {s.phone ? (
                        <View style={styles.contactChip}>
                          <Phone size={11} color={colors.brand} />
                          <Text style={styles.contactTxt}>{s.phone}</Text>
                        </View>
                      ) : null}
                      {s.whatsapp ? (
                        <View style={styles.contactChip}>
                          <MessageCircle size={11} color={colors.brand} />
                          <Text style={styles.contactTxt}>{s.whatsapp}</Text>
                        </View>
                      ) : null}
                      {s.submitter_phone ? <Text style={[styles.note, { marginTop: 8 }]}>From: {s.submitter_phone}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      testID={`approve-${s.id}`}
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => approveMut.mutate(s.id)}
                      disabled={approveMut.isPending}
                    >
                      <Check size={14} color={colors.onSuccess} />
                      <Text style={styles.approveTxt}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`reject-${s.id}`}
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => rejectMut.mutate(s.id)}
                      disabled={rejectMut.isPending}
                    >
                      <X size={14} color={colors.error} />
                      <Text style={styles.rejectTxt}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              !subsQ.isLoading && <Text style={styles.empty}>No pending submissions 🎉</Text>
            )}
          </>
        )}

        {tab === "pharmacies" && (
          <>
            <TouchableOpacity testID="admin-add-pharm" style={styles.addBtn} onPress={() => setShowAdd(true)}>
              <Plus size={14} color={colors.brand} />
              <Text style={styles.addTxt}>Add pharmacy</Text>
            </TouchableOpacity>
            {pharmsQ.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
            {pharmsQ.data?.map((p: any) => (
              <View key={p.id} style={styles.card} testID={`pharm-${p.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  {p.note ? <Text style={styles.note}>{p.note}</Text> : null}
                  {p.phone ? (
                    <View style={styles.contactChip}>
                      <Phone size={11} color={colors.brand} />
                      <Text style={styles.contactTxt}>{p.phone}</Text>
                    </View>
                  ) : null}
                  {p.whatsapp ? (
                    <View style={styles.contactChip}>
                      <MessageCircle size={11} color={colors.brand} />
                      <Text style={styles.contactTxt}>{p.whatsapp}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.note, { marginTop: 6 }]}>Source: {p.source}</Text>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity testID={`edit-${p.id}`} style={[styles.actionBtn, styles.editBtn]} onPress={() => setEditing(p)}>
                    <Edit3 size={14} color={colors.brand} />
                    <Text style={styles.editTxt}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`del-${p.id}`} style={[styles.actionBtn, styles.delBtn]} onPress={() => confirmDelete(p)}>
                    <Trash2 size={14} color={colors.error} />
                    <Text style={styles.delTxt}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "stats" && (
          <>
            {statsQ.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
            {statsQ.data ? (
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Users size={22} color={colors.onBrandSecondary} style={styles.statIcon} />
                  <Text style={styles.statValue}>{statsQ.data.users}</Text>
                  <Text style={styles.statLabel}>Total users</Text>
                </View>
                <View style={styles.statCard}>
                  <Pill size={22} color={colors.onBrandSecondary} style={styles.statIcon} />
                  <Text style={styles.statValue}>{statsQ.data.pharmacies}</Text>
                  <Text style={styles.statLabel}>Approved pharmacies</Text>
                </View>
                <View style={styles.statCard}>
                  <Clock size={22} color={colors.onBrandSecondary} style={styles.statIcon} />
                  <Text style={styles.statValue}>{statsQ.data.pending_submissions}</Text>
                  <Text style={styles.statLabel}>Pending submissions</Text>
                </View>
                <View style={styles.statCard}>
                  <Shield size={22} color={colors.onBrandSecondary} style={styles.statIcon} />
                  <Text style={styles.statValue}>{(statsQ.data.glucose_readings || 0) + (statsQ.data.bp_readings || 0)}</Text>
                  <Text style={styles.statLabel}>Total readings</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <PharmacyForm
        visible={showAdd || !!editing}
        pharmacy={editing}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        onSaved={() => {
          setShowAdd(false); setEditing(null);
          qc.invalidateQueries({ queryKey: ["admin-pharms"] });
          qc.invalidateQueries({ queryKey: ["admin-stats"] });
          qc.invalidateQueries({ queryKey: ["pharmacy-stockists"] });
        }}
      />
    </View>
  );
}

function PharmacyForm({ visible, pharmacy, onClose, onSaved }: { visible: boolean; pharmacy: any | null; onClose: () => void; onSaved: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [prevId, setPrevId] = useState<string | null>(null);
  // Reset form when pharmacy or visibility changes
  if (visible && pharmacy?.id !== prevId) {
    setPrevId(pharmacy?.id || null);
    setName(pharmacy?.name || "");
    setNote(pharmacy?.note || "");
    setPhone(pharmacy?.phone || "");
    setWhatsapp(pharmacy?.whatsapp || "");
  }
  if (!visible && prevId !== null) {
    setPrevId(null);
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), note: note.trim(), phone: phone.trim() || undefined, whatsapp: whatsapp.trim() || undefined };
      return pharmacy?.id ? api.adminUpdatePharmacy(pharmacy.id, body) : api.adminAddPharmacy(body);
    },
    onSuccess: () => onSaved(),
    onError: (e: any) => Alert.alert("Error", e?.message || "Could not save"),
  });

  function onSave() {
    if (!name.trim()) return Alert.alert("Name required", "Enter the pharmacy name.");
    saveMut.mutate();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{pharmacy?.id ? "Edit pharmacy" : "Add pharmacy"}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput testID="form-name" style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Link Pharmacy" placeholderTextColor={colors.muted} />

          <Text style={styles.label}>Note</Text>
          <TextInput testID="form-note" style={styles.input} value={note} onChangeText={setNote} placeholder="Branches, hours, notes" placeholderTextColor={colors.muted} />

          <Text style={styles.label}>Phone</Text>
          <TextInput testID="form-phone" style={styles.input} value={phone} onChangeText={setPhone} placeholder="+260 211 ..." placeholderTextColor={colors.muted} keyboardType="phone-pad" />

          <Text style={styles.label}>WhatsApp</Text>
          <TextInput testID="form-wa" style={styles.input} value={whatsapp} onChangeText={setWhatsapp} placeholder="+260 97X ..." placeholderTextColor={colors.muted} keyboardType="phone-pad" />

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={onClose}>
              <Text style={styles.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="form-save" style={[styles.modalBtn, styles.modalSave]} onPress={onSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSaveTxt}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
