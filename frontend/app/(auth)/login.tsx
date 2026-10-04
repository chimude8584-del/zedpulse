import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Activity, HeartPulse } from "lucide-react-native";

import { api, setToken } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  scroll: { padding: spacing.xl },
  logoWrap: {
    width: 72, height: 72, borderRadius: radius.lg,
    backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { fontSize: 30, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: c.muted, marginTop: spacing.xs, marginBottom: spacing.xl },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary, marginBottom: spacing.sm, marginTop: spacing.lg },
  input: {
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: 16, color: c.onSurface,
  },
  primaryBtn: {
    backgroundColor: c.brandPrimary, borderRadius: radius.md,
    paddingVertical: 16, alignItems: "center", marginTop: spacing.xl,
  },
  primaryBtnText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "600" },
  switch: { marginTop: spacing.lg, alignItems: "center" },
  switchText: { color: c.muted, fontSize: 14 },
  switchLink: { color: c.brand, fontWeight: "600" },
  error: { color: c.error, marginTop: spacing.md, fontSize: 14 },
  featureRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  featurePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: c.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  featurePillText: { color: c.onBrandTertiary, fontSize: 12, fontWeight: "600" },
}));

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+260 ");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!phone.trim() || !passcode.trim()) {
      setError("Enter phone and passcode");
      return;
    }
    if (!/^\d{4,8}$/.test(passcode)) {
      setError("Passcode must be 4-8 digits");
      return;
    }
    setLoading(true);
    try {
      const resp = mode === "login"
        ? await api.login(phone, passcode)
        : await api.signup(phone, passcode, name);
      await setToken(resp.token);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <HeartPulse color={colors.brand} size={36} />
        </View>
        <Text style={styles.title}>VitaTrack</Text>
        <Text style={styles.subtitle}>
          {mode === "login" ? "Welcome back. Sign in to continue." : "Create your private health journal."}
        </Text>

        <View style={styles.featureRow}>
          <View style={styles.featurePill}>
            <Activity size={14} color={colors.onBrandTertiary} />
            <Text style={styles.featurePillText}>Glucose</Text>
          </View>
          <View style={styles.featurePill}>
            <HeartPulse size={14} color={colors.onBrandTertiary} />
            <Text style={styles.featurePillText}>Blood Pressure</Text>
          </View>
        </View>

        {mode === "signup" && (
          <>
            <Text style={styles.label}>Name (optional)</Text>
            <TextInput
              testID="signup-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Alex"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
            />
          </>
        )}

        <Text style={styles.label}>Phone number</Text>
        <TextInput
          testID="auth-phone-input"
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+260 97 123 4567"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          autoComplete="tel"
        />

        <Text style={styles.label}>Passcode (4-8 digits)</Text>
        <TextInput
          testID="auth-passcode-input"
          style={styles.input}
          value={passcode}
          onChangeText={setPasscode}
          placeholder="••••"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
        />

        {error ? <Text testID="auth-error" style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          testID="auth-submit-button"
          style={styles.primaryBtn}
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          testID="auth-switch-mode"
          style={styles.switch}
          onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
        >
          <Text style={styles.switchText}>
            {mode === "login" ? "New here? " : "Have an account? "}
            <Text style={styles.switchLink}>{mode === "login" ? "Create account" : "Sign in"}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
