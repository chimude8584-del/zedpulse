import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sparkles, Apple, Pill, HeartPulse, Activity, Send } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 2 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  quick: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.pill,
  },
  quickTxt: { fontSize: 13, color: c.onSurface, fontWeight: "600" },
  bubbleUser: {
    marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: c.brandPrimary, alignSelf: "flex-end", maxWidth: "85%",
  },
  bubbleUserTxt: { color: c.onBrandPrimary, fontSize: 14 },
  bubbleAi: {
    marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    maxWidth: "92%", alignSelf: "flex-start",
  },
  bubbleAiTxt: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
    backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
  },
  input: {
    flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 12,
    color: c.onSurface, fontSize: 15,
  },
  send: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  disclaimer: {
    marginHorizontal: spacing.xl, marginTop: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: c.brandTertiary,
  },
  disclaimerTxt: { fontSize: 12, color: c.onBrandTertiary, lineHeight: 16 },
  intro: {
    marginHorizontal: spacing.xl, marginBottom: spacing.lg,
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    flexDirection: "row", gap: spacing.md, alignItems: "flex-start",
  },
  introTxt: { flex: 1, fontSize: 14, color: c.onSurface, lineHeight: 20 },
}));

type Msg = { role: "user" | "ai"; text: string };

export default function Advisor() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(question?: string, kind: string = "general") {
    const text = (question ?? input).trim();
    if (!text && kind === "general") return;
    const userText = text || `Give me ${kind} guidance`;
    setMessages((m) => [...m, { role: "user", text: userText }]);
    setInput("");
    setLoading(true);
    try {
      const resp = await api.advice({ question: text || undefined, kind });
      setMessages((m) => [...m, { role: "ai", text: resp.answer }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "ai", text: `Sorry — ${e.message || "something went wrong"}.` }]);
    } finally {
      setLoading(false);
    }
  }

  const quickActions = [
    { key: "diet", icon: Apple, label: "Diet tips" },
    { key: "glucose", icon: Activity, label: "Glucose plan" },
    { key: "bp", icon: HeartPulse, label: "BP tips" },
    { key: "treatment", icon: Pill, label: "Treatment" },
  ];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Advisor</Text>
          <Text style={styles.subtitle}>Personalized tips based on your readings.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.intro}>
            <Sparkles size={22} color={colors.brand} />
            <Text style={styles.introTxt}>
              Ask about diet, hypo/hyper response, or BP tips. I’ll use your recent readings for context.
            </Text>
          </View>
        )}

        <View style={styles.quickRow}>
          {quickActions.map((q) => (
            <TouchableOpacity
              key={q.key}
              testID={`quick-${q.key}`}
              style={styles.quick}
              onPress={() => ask(undefined, q.key)}
              disabled={loading}
            >
              <q.icon size={14} color={colors.brand} />
              <Text style={styles.quickTxt}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {messages.map((m, i) => (
          <View
            key={i}
            testID={`msg-${m.role}-${i}`}
            style={m.role === "user" ? styles.bubbleUser : styles.bubbleAi}
          >
            <Text style={m.role === "user" ? styles.bubbleUserTxt : styles.bubbleAiTxt}>{m.text}</Text>
          </View>
        ))}

        {loading && (
          <View style={styles.bubbleAi}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )}

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTxt}>
            Educational guidance only — not a medical diagnosis. For dosing changes or emergencies, contact your clinician.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          testID="advisor-input"
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask the advisor…"
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => ask()}
          returnKeyType="send"
        />
        <TouchableOpacity testID="advisor-send" style={styles.send} onPress={() => ask()} disabled={loading}>
          <Send size={18} color={colors.onBrandPrimary} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
