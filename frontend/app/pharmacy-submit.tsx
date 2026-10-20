import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Store, Check, Clock, XCircle } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  intro: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.md, lineHeight: 18 },
  form: { marginHorizontal: spacing.xl, padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, gap: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: c.onSurface },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  submit: { marginTop: spacing.sm, backgroundColor: c.brand, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  submitTxt: { color: c.onBrand, fontSize: 15, fontWeight: "700" },
  hint: { fontSize: 11, color: c.muted, marginTop: -8 },
  section: { marginTop: spacing.lg, marginHorizontal: spacing.xl, padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
  itemRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemName: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  itemNote: { fontSize: 12, color: c.muted, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: 4 },
  pendingPill: { backgroundColor: c.warning + "22" },
  approvedPill: { backgroundColor: c.success + "22" },
  rejectedPill: { backgroundColor: c.error + "22" },
  statusTxt: { fontSize: 11, fontWeight: "700" },
  empty: { color: c.muted, fontSize: 13, fontStyle: "italic", textAlign: "center", paddingVertical: spacing.md },
}));

export default function PharmacySubmit() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [note, setNote] = useState("");

  const minsQ = useQuery({ queryKey: ["my-submissions"], queryFn: () => api.mySubmissions() });

  const mut = useMutation({
    mutationFn: () => api.submitPharmacy({ name: name.trim(), branch: branch.trim() || undefined, phone: phone.trim() || undefined, whatsapp: whatsapp.trim() || undefined, note: note.trim() || undefined }),
    onSuccess: () => {
      Alert.alert("Thank you!", "Your suggestion was sent to the admin for approval. It will appear in the pharmacy list once approved.");
      setName(""); setBranch(""); setPhone(""); setWhatsapp(""); setNote("");
      minsQ.refetch();
    },
    onError: (e: any) => Alert.alert("Could not submit", e?.message || "Please try again."),
  });

  function onSubmit() {
    if (!name.trim()) return Alert.alert("Name required", "Please enter the pharmacy name.");
    if (!phone.trim() && !whatsapp.trim()) return Alert.alert("Contact required", "Please add a phone or WhatsApp number.");
    mut.mutate();
  }

  function statusView(status: string) {
    if (status === "approved") {
      return (
        <View style={[styles.statusPill, styles.approvedPill]}>
          <Check size={11} color={colors.success} />
          <Text style={[styles.statusTxt, { color: colors.success }]}>Approved</Text>
        </View>
      );
    }
    if (status === "rejected") {
      return (
        <View style={[styles.statusPill, styles.rejectedPill]}>
          <XCircle size={11} color={colors.error} />
          <Text style={[styles.statusTxt, { color: colors.error }]}>Rejected</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusPill, styles.pendingPill]}>
        <Clock size={11} color={colors.warning} />
        <Text style={[styles.statusTxt, { color: colors.warning }]}>Pending</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity testID="submit-back" style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.title}>Suggest a pharmacy</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Know a Zambian pharmacy or branch that's not on the list? Share its number so other users can call for prices or stock updates. An admin will review before it goes live.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Pharmacy name *</Text>
            <TextInput
              testID="submit-name"
              style={styles.input}
              placeholder="e.g. Pharmanova"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Branch / location</Text>
            <TextInput
              testID="submit-branch"
              style={styles.input}
              placeholder="e.g. Levy Mall, Lusaka"
              placeholderTextColor={colors.muted}
              value={branch}
              onChangeText={setBranch}
            />

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              testID="submit-phone"
              style={styles.input}
              placeholder="e.g. +260 211 123 456"
              placeholderTextColor={colors.muted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>WhatsApp number</Text>
            <TextInput
              testID="submit-wa"
              style={styles.input}
              placeholder="e.g. +260 97X XXX XXX"
              placeholderTextColor={colors.muted}
              value={whatsapp}
              onChangeText={setWhatsapp}
              keyboardType="phone-pad"
            />
            <Text style={styles.hint}>At least one of Phone or WhatsApp is required.</Text>

            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              testID="submit-note"
              style={[styles.input, styles.textarea]}
              placeholder="e.g. 24-hour branch, delivers in Lusaka"
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={setNote}
              multiline
            />

            <TouchableOpacity testID="submit-send" style={styles.submit} onPress={onSubmit} disabled={mut.isPending}>
              {mut.isPending ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.submitTxt}>Submit for review</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Store size={14} color={colors.brand} />
              <Text style={styles.sectionLabel}>My submissions</Text>
            </View>
            {minsQ.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
            {minsQ.data?.length ? (
              minsQ.data.map((s: any, idx: number) => (
                <View key={s.id} style={[styles.itemRow, idx === 0 && { borderTopWidth: 0 }]} testID={`my-sub-${idx}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{s.name}</Text>
                    {s.note ? <Text style={styles.itemNote}>{s.note}</Text> : null}
                    {s.phone ? <Text style={styles.itemNote}>📞 {s.phone}</Text> : null}
                    {s.whatsapp ? <Text style={styles.itemNote}>💬 {s.whatsapp}</Text> : null}
                  </View>
                  {statusView(s.status)}
                </View>
              ))
            ) : (
              !minsQ.isLoading && <Text style={styles.empty}>No submissions yet.</Text>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
