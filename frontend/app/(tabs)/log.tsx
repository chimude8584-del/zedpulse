import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, HeartPulse, Check } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { HypoRescueCard } from "@/src/components/hypo-rescue-card";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 2 },
  segmentRow: {
    flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.lg,
  },
  segment: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  segmentActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  segmentText: { fontSize: 14, fontWeight: "600", color: c.onSurfaceTertiary },
  segmentTextActive: { color: c.onBrandPrimary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary, marginTop: spacing.md, marginBottom: spacing.sm },
  input: {
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: 16, color: c.onSurface,
  },
  inputRow: { flexDirection: "row", gap: spacing.md },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  chipActive: { backgroundColor: c.brandSecondary, borderColor: c.brand },
  chipTxt: { fontSize: 13, color: c.onSurfaceTertiary, fontWeight: "500" },
  chipTxtActive: { color: c.onBrandSecondary, fontWeight: "700" },
  submit: {
    marginTop: spacing.xl, backgroundColor: c.brandPrimary, borderRadius: radius.md,
    paddingVertical: 16, alignItems: "center",
  },
  submitTxt: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "600" },
  resultCard: {
    marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  resultTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginBottom: spacing.xs },
  resultMsg: { fontSize: 14, color: c.onSurfaceTertiary, lineHeight: 20 },
  error: { color: c.error, marginTop: spacing.md, fontSize: 14 },
  helper: { fontSize: 12, color: c.muted, marginTop: 4 },
}));

const CONTEXTS = [
  { key: "fasting", label: "Fasting" },
  { key: "before_meal", label: "Before meal" },
  { key: "after_meal", label: "After meal" },
  { key: "bedtime", label: "Bedtime" },
  { key: "random", label: "Random" },
];

export default function LogScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"glucose" | "bp">("glucose");

  // Glucose state
  const [gValue, setGValue] = useState("");
  const [gContext, setGContext] = useState("random");
  const [gNote, setGNote] = useState("");

  // BP state
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [pulse, setPulse] = useState("");
  const [bpNote, setBpNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const glucoseMut = useMutation({
    mutationFn: () => api.addGlucose({ value: parseFloat(gValue), context: gContext, note: gNote }),
    onSuccess: (r) => {
      setResult(r);
      setGValue(""); setGNote("");
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["glucose-list"] });
    },
    onError: (e: any) => setError(e.message || "Failed to save"),
  });
  const bpMut = useMutation({
    mutationFn: () => api.addBP({
      systolic: parseInt(sys, 10),
      diastolic: parseInt(dia, 10),
      pulse: pulse ? parseInt(pulse, 10) : undefined,
      note: bpNote,
    }),
    onSuccess: (r) => {
      setResult(r);
      setSys(""); setDia(""); setPulse(""); setBpNote("");
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["bp-list"] });
    },
    onError: (e: any) => setError(e.message || "Failed to save"),
  });

  function submit() {
    setError(null);
    setResult(null);
    if (mode === "glucose") {
      const v = parseFloat(gValue);
      if (!v || v <= 0 || v > 40) { setError("Enter a glucose value between 0 and 40 mmol/L"); return; }
      glucoseMut.mutate();
    } else {
      const s = parseInt(sys, 10);
      const d = parseInt(dia, 10);
      if (!s || !d) { setError("Enter systolic and diastolic"); return; }
      bpMut.mutate();
    }
  }

  const loading = glucoseMut.isPending || bpMut.isPending;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>New reading</Text>
          <Text style={styles.subtitle}>Keep a log — share it with your clinician anytime.</Text>
        </View>

        <View style={styles.segmentRow}>
          <TouchableOpacity
            testID="segment-glucose"
            style={[styles.segment, mode === "glucose" && styles.segmentActive]}
            onPress={() => { setMode("glucose"); setResult(null); setError(null); }}
          >
            <Activity size={16} color={mode === "glucose" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
            <Text style={[styles.segmentText, mode === "glucose" && styles.segmentTextActive]}>Glucose</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="segment-bp"
            style={[styles.segment, mode === "bp" && styles.segmentActive]}
            onPress={() => { setMode("bp"); setResult(null); setError(null); }}
          >
            <HeartPulse size={16} color={mode === "bp" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
            <Text style={[styles.segmentText, mode === "bp" && styles.segmentTextActive]}>Blood Pressure</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {mode === "glucose" ? (
            <>
              <Text style={styles.label}>Value (mmol/L)</Text>
              <TextInput
                testID="glucose-value-input"
                style={styles.input}
                value={gValue}
                onChangeText={setGValue}
                keyboardType="decimal-pad"
                placeholder="e.g. 5.6"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.helper}>In range: 4.0–7.0 fasting • 5.0–10.0 after meal</Text>

              <Text style={styles.label}>Context</Text>
              <View style={styles.chipsRow}>
                {CONTEXTS.map((ctx) => {
                  const active = gContext === ctx.key;
                  return (
                    <TouchableOpacity
                      key={ctx.key}
                      testID={`context-${ctx.key}`}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setGContext(ctx.key)}
                    >
                      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{ctx.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                testID="glucose-note-input"
                style={styles.input}
                value={gNote}
                onChangeText={setGNote}
                placeholder="e.g. after breakfast"
                placeholderTextColor={colors.muted}
              />
            </>
          ) : (
            <>
              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Systolic</Text>
                  <TextInput
                    testID="bp-systolic-input"
                    style={styles.input}
                    value={sys}
                    onChangeText={setSys}
                    keyboardType="number-pad"
                    placeholder="120"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Diastolic</Text>
                  <TextInput
                    testID="bp-diastolic-input"
                    style={styles.input}
                    value={dia}
                    onChangeText={setDia}
                    keyboardType="number-pad"
                    placeholder="80"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
              <Text style={styles.helper}>mmHg · normal under 120/80</Text>

              <Text style={styles.label}>Pulse (optional)</Text>
              <TextInput
                testID="bp-pulse-input"
                style={styles.input}
                value={pulse}
                onChangeText={setPulse}
                keyboardType="number-pad"
                placeholder="e.g. 72"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                testID="bp-note-input"
                style={styles.input}
                value={bpNote}
                onChangeText={setBpNote}
                placeholder="e.g. after walk"
                placeholderTextColor={colors.muted}
              />
            </>
          )}

          {error ? <Text testID="log-error" style={styles.error}>{error}</Text> : null}

          {result ? (
            <View
              testID="log-result-card"
              style={[styles.resultCard, { borderLeftWidth: 4, borderLeftColor: result.severity === "critical" ? colors.error : result.severity === "warning" ? colors.warning : colors.success }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Check size={18} color={colors.brand} />
                <Text style={styles.resultTitle}>{result.label}</Text>
              </View>
              <Text style={styles.resultMsg}>{result.message}</Text>
            </View>
          ) : null}

          {result && (result.status === "hypo" || result.status === "severe_hypo") ? (
            <HypoRescueCard
              severity={result.status === "severe_hypo" ? "critical" : "warning"}
              onRecheck={() => {
                setResult(null);
                setGValue("");
              }}
            />
          ) : null}

          <TouchableOpacity
            testID="log-submit-button"
            style={styles.submit}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.submitTxt}>Save reading</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
