import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users, MessageCircle, Trash2, Save, AlertTriangle } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  subtitle: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.lg, lineHeight: 18 },
  card: { marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  label: { fontSize: 12, fontWeight: "600", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: c.onSurface },
  save: { backgroundColor: c.brandPrimary, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.sm },
  saveTxt: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  err: { color: c.error, fontSize: 13 },
  activeCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.brandSecondary },
  activeName: { fontSize: 18, fontWeight: "700", color: c.onBrandSecondary },
  activePhone: { fontSize: 14, color: c.onBrandSecondary, opacity: 0.8, marginTop: 2 },
  waBtn: { marginTop: spacing.md, backgroundColor: "#25D366", borderRadius: radius.md, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  waBtnTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  removeBtn: { marginTop: spacing.sm, padding: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  removeTxt: { color: c.error, fontSize: 13, fontWeight: "600" },
  helper: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary, flexDirection: "row", gap: spacing.sm },
  helperTxt: { flex: 1, fontSize: 12, color: c.onBrandTertiary, lineHeight: 18 },
}));

export function waMessage(phone: string, text: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${digits}?text=${encoded}`;
}

export default function FamilyAlerts() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+260 ");
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["emergency-contact"], queryFn: () => api.getEmergencyContact() });

  useEffect(() => {
    if (q.data?.name) setName(q.data.name);
    if (q.data?.phone) setPhone(q.data.phone);
  }, [q.data?.name, q.data?.phone]);

  const saveMut = useMutation({
    mutationFn: () => api.setEmergencyContact(name, phone),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ["emergency-contact"] }); },
    onError: (e: any) => setError(e.message),
  });
  const delMut = useMutation({
    mutationFn: () => api.deleteEmergencyContact(),
    onSuccess: () => { setName(""); setPhone("+260 "); qc.invalidateQueries({ queryKey: ["emergency-contact"] }); },
  });

  function save() {
    setError(null);
    if (!name.trim()) { setError("Add their name"); return; }
    if (phone.replace(/[^\d]/g, "").length < 9) { setError("Enter a valid phone (incl. country code)"); return; }
    saveMut.mutate();
  }

  async function testWhatsApp() {
    const url = waMessage(q.data!.phone!, `Hi ${q.data?.name}, this is a test message from my ZedPulse app. In an emergency I'll send my latest readings here.`);
    try { await Linking.openURL(url); } catch {}
  }

  const hasContact = !!q.data?.phone;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <View style={styles.header}>
          <TouchableOpacity testID="fam-back" style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.title}>Family alerts</Text>
        </View>
        <Text style={styles.subtitle}>
          Save one trusted contact. On severe hypo or hypertensive crisis, you&apos;ll get a one-tap button on your home screen to WhatsApp them your readings.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            testID="fam-name"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Mum, Partner, Nurse"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>WhatsApp number (with country code)</Text>
          <TextInput
            testID="fam-phone"
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+260 97 123 4567"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
          />
          {error ? <Text style={styles.err} testID="fam-err">{error}</Text> : null}
          <TouchableOpacity testID="fam-save" style={styles.save} onPress={save} disabled={saveMut.isPending}>
            {saveMut.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Save size={16} color={colors.onBrandPrimary} />
                <Text style={styles.saveTxt}>{hasContact ? "Update contact" : "Save contact"}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {hasContact && (
          <View style={styles.activeCard} testID="fam-active">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Users size={18} color={colors.onBrandSecondary} />
              <Text style={styles.activeName}>{q.data?.name}</Text>
            </View>
            <Text style={styles.activePhone}>{q.data?.phone}</Text>
            <TouchableOpacity testID="fam-test" style={styles.waBtn} onPress={testWhatsApp}>
              <MessageCircle size={16} color="#FFFFFF" />
              <Text style={styles.waBtnTxt}>Send test message on WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.removeBtn} onPress={() => delMut.mutate()} testID="fam-remove">
              <Trash2 size={14} color={colors.error} />
              <Text style={styles.removeTxt}>Remove contact</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.helper}>
          <AlertTriangle size={16} color={colors.onBrandTertiary} />
          <Text style={styles.helperTxt}>
            Nothing is sent automatically. You tap, we open WhatsApp with a pre-filled message — you choose to send.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
