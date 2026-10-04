import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pill, Trash2, Plus, Check } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  subtitle: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.md },
  formCard: { marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: spacing.sm, marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: "600", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: c.onSurface },
  row2: { flexDirection: "row", gap: spacing.md },
  addBtn: { backgroundColor: c.brandPrimary, borderRadius: radius.md, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  addBtnTxt: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  item: { marginHorizontal: spacing.xl, marginBottom: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  itemTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  medIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  itemDose: { fontSize: 13, color: c.muted, marginTop: 2 },
  itemBottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  takeBtn: { flex: 1, backgroundColor: c.brandPrimary, borderRadius: radius.md, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  takeBtnTxt: { color: c.onBrandPrimary, fontSize: 13, fontWeight: "600" },
  takenPill: { paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  takenPillTxt: { fontSize: 12, color: c.onSurfaceTertiary, fontWeight: "600" },
  takenDone: { backgroundColor: c.success + "22" },
  takenDoneTxt: { color: c.success, fontWeight: "700" },
  delBtn: { padding: spacing.sm },
  empty: { padding: spacing.xl, alignItems: "center", gap: 8 },
  emptyTxt: { color: c.muted, fontSize: 14, textAlign: "center" },
  err: { color: c.error, fontSize: 13 },
}));

export default function Medications() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [times, setTimes] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["medications"], queryFn: () => api.listMedications() });

  const addMut = useMutation({
    mutationFn: () => api.addMedication({
      name, dose, times_per_day: parseInt(times, 10) || 1,
    }),
    onSuccess: () => {
      setName(""); setDose(""); setTimes("1"); setError(null);
      qc.invalidateQueries({ queryKey: ["medications"] });
    },
    onError: (e: any) => setError(e.message),
  });
  const takeMut = useMutation({
    mutationFn: (id: string) => api.logMedication(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["medications"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteMedication(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["medications"] }),
  });

  function submit() {
    setError(null);
    if (!name.trim() || !dose.trim()) { setError("Name and dose required"); return; }
    const t = parseInt(times, 10);
    if (!t || t < 1 || t > 10) { setError("Times per day must be 1-10"); return; }
    addMut.mutate();
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <View style={styles.header}>
          <TouchableOpacity testID="med-back" style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.title}>Medications</Text>
        </View>
        <Text style={styles.subtitle}>Track doses and share adherence with your doctor.</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.formCard}>
          <Text style={styles.label}>Medication name</Text>
          <TextInput
            testID="med-name"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Metformin"
            placeholderTextColor={colors.muted}
          />
          <View style={styles.row2}>
            <View style={{ flex: 2 }}>
              <Text style={styles.label}>Dose</Text>
              <TextInput
                testID="med-dose"
                style={styles.input}
                value={dose}
                onChangeText={setDose}
                placeholder="500 mg"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Times/day</Text>
              <TextInput
                testID="med-times"
                style={styles.input}
                value={times}
                onChangeText={setTimes}
                placeholder="2"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
          </View>
          {error ? <Text style={styles.err} testID="med-err">{error}</Text> : null}
          <TouchableOpacity testID="med-add" style={styles.addBtn} onPress={submit} disabled={addMut.isPending}>
            {addMut.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Plus size={16} color={colors.onBrandPrimary} />
                <Text style={styles.addBtnTxt}>Add medication</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {q.data?.length === 0 && (
          <View style={styles.empty}>
            <Pill size={28} color={colors.muted} />
            <Text style={styles.emptyTxt}>No medications added yet.</Text>
          </View>
        )}

        {q.data?.map((m: any) => {
          const done = m.taken_today >= m.times_per_day;
          return (
            <View key={m.id} style={styles.item} testID={`med-item-${m.id}`}>
              <View style={styles.itemTop}>
                <View style={styles.medIcon}><Pill size={18} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{m.name}</Text>
                  <Text style={styles.itemDose}>{m.dose} · {m.times_per_day}× daily</Text>
                </View>
                <TouchableOpacity style={styles.delBtn} onPress={() => delMut.mutate(m.id)} testID={`med-del-${m.id}`}>
                  <Trash2 size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <View style={styles.itemBottom}>
                <TouchableOpacity
                  testID={`med-take-${m.id}`}
                  style={[styles.takeBtn, done && { opacity: 0.5 }]}
                  onPress={() => takeMut.mutate(m.id)}
                  disabled={done}
                >
                  <Check size={14} color={colors.onBrandPrimary} />
                  <Text style={styles.takeBtnTxt}>{done ? "All done today" : "Log dose"}</Text>
                </TouchableOpacity>
                <View style={[styles.takenPill, done && styles.takenDone]}>
                  <Text style={[styles.takenPillTxt, done && styles.takenDoneTxt]}>
                    {m.taken_today}/{m.times_per_day} today
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
