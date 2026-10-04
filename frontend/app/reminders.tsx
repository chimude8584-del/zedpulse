import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Trash2, Plus, Clock } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { ensureNotificationPermission, scheduleDailyReminder, cancelReminder } from "@/src/utils/reminders";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  subtitle: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.md },
  warn: { marginHorizontal: spacing.xl, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.warning },
  warnTxt: { color: c.warning, fontSize: 13, fontWeight: "600" },
  formCard: { marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: spacing.sm, marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: "600", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: c.onSurface },
  row2: { flexDirection: "row", gap: spacing.md },
  kindRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  kindChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  kindChipActive: { backgroundColor: c.brandSecondary, borderColor: c.brand },
  kindChipTxt: { fontSize: 13, color: c.onSurfaceTertiary, fontWeight: "500" },
  kindChipTxtActive: { color: c.onBrandSecondary, fontWeight: "700" },
  addBtn: { backgroundColor: c.brandPrimary, borderRadius: radius.md, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  addBtnTxt: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  item: { marginHorizontal: spacing.xl, marginBottom: spacing.sm, padding: spacing.lg, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: spacing.md },
  itemLabel: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  itemTime: { fontSize: 13, color: c.muted, marginTop: 2 },
  delBtn: { padding: spacing.sm },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyTxt: { color: c.muted, fontSize: 14 },
  err: { color: c.error, paddingHorizontal: spacing.xl, fontSize: 13, marginTop: spacing.xs },
}));

const KINDS = [
  { key: "glucose", label: "Glucose" },
  { key: "bp", label: "BP" },
  { key: "medication", label: "Medication" },
  { key: "general", label: "General" },
];

export default function Reminders() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [label, setLabel] = useState("");
  const [time, setTime] = useState("");
  const [kind, setKind] = useState("glucose");
  const [permState, setPermState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["reminders"], queryFn: () => api.listReminders() });

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await api.addReminder({ label, time, kind });
      if (r.enabled) await scheduleDailyReminder(r.id, r.label, r.time);
      return r;
    },
    onSuccess: () => {
      setLabel(""); setTime(""); setError(null);
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (e: any) => setError(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (r: any) => {
      const updated = await api.toggleReminder(r.id, !r.enabled);
      if (updated.enabled) await scheduleDailyReminder(updated.id, updated.label, updated.time);
      else await cancelReminder(updated.id);
      return updated;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const delMut = useMutation({
    mutationFn: async (r: any) => {
      await cancelReminder(r.id);
      return api.deleteReminder(r.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] }),
  });

  async function submit() {
    setError(null);
    if (!label.trim()) { setError("Add a label"); return; }
    if (!/^\d{2}:\d{2}$/.test(time)) { setError("Time must be HH:MM (24h)"); return; }
    const perm = await ensureNotificationPermission();
    setPermState(perm);
    if (perm === "blocked") {
      setError("Notifications are blocked. Enable them in Settings.");
      return;
    }
    addMut.mutate();
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <View style={styles.header}>
          <TouchableOpacity testID="rem-back" style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.title}>Reminders</Text>
        </View>
        <Text style={styles.subtitle}>Daily local notifications on this device.</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {Platform.OS === "web" && (
          <View style={styles.warn}>
            <Text style={styles.warnTxt}>Reminders need the mobile app — scan the Expo Go QR to try them.</Text>
          </View>
        )}
        {permState === "blocked" && (
          <View style={styles.warn}>
            <Text style={styles.warnTxt}>Notifications blocked. Enable them in your phone Settings.</Text>
          </View>
        )}

        <View style={styles.formCard}>
          <Text style={styles.label}>Label</Text>
          <TextInput
            testID="rem-label"
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Morning glucose check"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Time (24h)</Text>
          <TextInput
            testID="rem-time"
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder="07:30"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <Text style={styles.label}>Type</Text>
          <View style={styles.kindRow}>
            {KINDS.map((k) => {
              const active = kind === k.key;
              return (
                <TouchableOpacity
                  key={k.key}
                  testID={`rem-kind-${k.key}`}
                  style={[styles.kindChip, active && styles.kindChipActive]}
                  onPress={() => setKind(k.key)}
                >
                  <Text style={[styles.kindChipTxt, active && styles.kindChipTxtActive]}>{k.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {error ? <Text style={styles.err} testID="rem-err">{error}</Text> : null}
          <TouchableOpacity testID="rem-add" style={styles.addBtn} onPress={submit} disabled={addMut.isPending}>
            {addMut.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Plus size={16} color={colors.onBrandPrimary} />
                <Text style={styles.addBtnTxt}>Add reminder</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {q.data?.length === 0 && (
          <View style={styles.empty}>
            <Bell size={28} color={colors.muted} />
            <Text style={styles.emptyTxt}>No reminders yet — add one above.</Text>
          </View>
        )}

        {q.data?.map((r: any) => (
          <View key={r.id} style={styles.item} testID={`rem-item-${r.id}`}>
            <Clock size={18} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemLabel}>{r.label}</Text>
              <Text style={styles.itemTime}>{r.time} · {r.kind}</Text>
            </View>
            <Switch
              testID={`rem-switch-${r.id}`}
              value={r.enabled}
              onValueChange={() => toggleMut.mutate(r)}
              trackColor={{ true: colors.brand, false: colors.border }}
              thumbColor={colors.surface}
            />
            <TouchableOpacity style={styles.delBtn} onPress={() => delMut.mutate(r)} testID={`rem-del-${r.id}`}>
              <Trash2 size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
