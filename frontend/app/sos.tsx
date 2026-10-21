import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, Linking, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { ArrowLeft, Phone, MapPin, Hospital, AlertTriangle, Users, ChevronRight } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },

  hero: {
    marginHorizontal: spacing.xl, padding: spacing.xl,
    borderRadius: radius.lg, backgroundColor: c.error + "15",
    borderWidth: 1, borderColor: c.error,
    alignItems: "center",
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: c.error,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: c.error, textAlign: "center" },
  heroSub: { fontSize: 14, color: c.onSurfaceTertiary, textAlign: "center", marginTop: 6, lineHeight: 20 },

  actionBtn: {
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  callBtn: { backgroundColor: c.error, borderColor: c.error },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.brand, alignItems: "center", justifyContent: "center",
  },
  iconWrapRed: { backgroundColor: c.onError },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  actionTitleOnError: { color: c.onError },
  actionSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  actionSubOnError: { color: c.onError, opacity: 0.9 },

  warning: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    padding: spacing.lg, borderRadius: radius.md,
    backgroundColor: c.warning + "22", borderWidth: 1, borderColor: c.warning,
  },
  warningTxt: { fontSize: 13, color: c.onSurface, lineHeight: 19 },
  warningBold: { fontWeight: "700", color: c.warning },

  disclaimer: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  disclaimerTxt: { fontSize: 11, color: c.muted, lineHeight: 16, textAlign: "center" },

  clinicBox: {
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  clinicTitle: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm },
  clinicRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, flexDirection: "row", alignItems: "center", gap: 8 },
  clinicName: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  clinicMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
}));

export default function SOS() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const contactQ = useQuery({ queryKey: ["emergency-contact"], queryFn: () => api.getEmergencyContact() });
  const nearestQ = useQuery({
    queryKey: ["nearest-clinic", coords?.lat, coords?.lng],
    queryFn: () => api.nearestClinic(coords!.lat, coords!.lng, 3),
    enabled: !!coords,
  });

  async function getLocation(): Promise<{ lat: number; lng: number } | null> {
    try {
      setLocating(true);
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Location permission needed",
            "To find the nearest clinic and share your position, enable location in your phone settings.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Open settings", onPress: () => Linking.openSettings() },
            ],
          );
          return null;
        }
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status !== "granted") return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(c);
      return c;
    } catch (e: any) {
      Alert.alert("Location failed", e?.message || "Could not fetch your location.");
      return null;
    } finally {
      setLocating(false);
    }
  }

  // Auto-fetch location when screen loads (safe prompt)
  useEffect(() => {
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  function digits(s?: string | null) {
    return (s || "").replace(/[^+\d]/g, "");
  }

  function callFamily() {
    const p = digits(contactQ.data?.phone);
    if (!p) {
      Alert.alert(
        "No emergency contact set",
        "Add a family member or caregiver's number so you can reach them with one tap.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add contact", onPress: () => router.push("/family-alerts") },
        ],
      );
      return;
    }
    api.logSOS({ lat: coords?.lat, lng: coords?.lng, note: "call_family" }).catch(() => {});
    Linking.openURL(`tel:${p}`).catch(() => Alert.alert("Cannot dial", "Your device cannot place calls."));
  }

  async function shareLocation() {
    let c = coords;
    if (!c) c = await getLocation();
    if (!c) return;
    const p = digits(contactQ.data?.phone);
    if (!p) {
      Alert.alert(
        "No emergency contact set",
        "Add a family contact so we can WhatsApp them your location.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add contact", onPress: () => router.push("/family-alerts") },
        ],
      );
      return;
    }
    const name = contactQ.data?.name || "Family";
    const mapUrl = `https://maps.google.com/?q=${c.lat},${c.lng}`;
    const text = `🆘 I need help. This is my current location on ZedPulse: ${mapUrl}\n\nMessage sent via ZedPulse SOS.`;
    const waPhone = p.replace(/^\+/, "");
    api.logSOS({ lat: c.lat, lng: c.lng, note: `share_location_to_${name}` }).catch(() => {});
    Linking.openURL(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`).catch(() => {
      Alert.alert("WhatsApp not available", "Please install WhatsApp or call directly.");
    });
  }

  async function openNearest() {
    let c = coords;
    if (!c) c = await getLocation();
    if (!c) return;
    const list = await api.nearestClinic(c.lat, c.lng, 1).catch(() => []);
    if (!list?.length) {
      Alert.alert("No clinics found", "Could not find a nearby clinic right now.");
      return;
    }
    const n = list[0];
    api.logSOS({ lat: c.lat, lng: c.lng, note: `open_directions_to_${n.name}` }).catch(() => {});
    const url = `https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lng}&travelmode=driving`;
    Linking.openURL(url).catch(() => Alert.alert("Cannot open maps", "Google Maps is not available."));
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="sos-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Emergency SOS</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <AlertTriangle size={34} color={colors.onError} />
          </View>
          <Text style={styles.heroTitle}>Are you feeling unwell?</Text>
          <Text style={styles.heroSub}>Tap one of the actions below. We'll help you get help fast.</Text>
        </View>

        {/* Call Family */}
        <TouchableOpacity testID="sos-call" style={[styles.actionBtn, styles.callBtn]} onPress={callFamily}>
          <View style={[styles.iconWrap, styles.iconWrapRed]}>
            <Phone size={22} color={colors.error} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, styles.actionTitleOnError]}>Call family</Text>
            <Text style={[styles.actionSub, styles.actionSubOnError]}>
              {contactQ.data?.name ? `Reach ${contactQ.data.name}` : "Add an emergency contact first"}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.onError} />
        </TouchableOpacity>

        {/* Share Location */}
        <TouchableOpacity testID="sos-share" style={styles.actionBtn} onPress={shareLocation}>
          <View style={styles.iconWrap}>
            {locating ? <ActivityIndicator color={colors.onBrand} /> : <MapPin size={22} color={colors.onBrand} />}
          </View>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Share my location</Text>
            <Text style={styles.actionSub}>Send family a WhatsApp with Google Maps pin</Text>
          </View>
          <ChevronRight size={20} color={colors.muted} />
        </TouchableOpacity>

        {/* Nearest Clinic */}
        <TouchableOpacity testID="sos-clinic" style={styles.actionBtn} onPress={openNearest}>
          <View style={styles.iconWrap}>
            <Hospital size={22} color={colors.onBrand} />
          </View>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Nearest clinic</Text>
            <Text style={styles.actionSub}>Open driving directions in Google Maps</Text>
          </View>
          <ChevronRight size={20} color={colors.muted} />
        </TouchableOpacity>

        {/* Nearest clinics list */}
        {nearestQ.data?.length ? (
          <View style={styles.clinicBox}>
            <Text style={styles.clinicTitle}>Closest clinics to you</Text>
            {nearestQ.data.map((cl: any, i: number) => (
              <TouchableOpacity
                key={cl.name}
                style={[styles.clinicRow, i === 0 && { borderTopWidth: 0 }]}
                onPress={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${cl.lat},${cl.lng}&travelmode=driving`;
                  Linking.openURL(url).catch(() => {});
                }}
              >
                <Hospital size={16} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clinicName}>{cl.name}</Text>
                  <Text style={styles.clinicMeta}>{cl.city} · {cl.type} · {cl.distance_km} km away</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const phone = (cl.phone || "").replace(/[^+\d]/g, "");
                    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
                  }}
                  style={{ padding: 8 }}
                >
                  <Phone size={16} color={colors.brand} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Emergency contact prompt */}
        {!contactQ.data?.phone ? (
          <TouchableOpacity testID="sos-add-contact" style={styles.actionBtn} onPress={() => router.push("/family-alerts")}>
            <View style={styles.iconWrap}>
              <Users size={22} color={colors.onBrand} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Add an emergency contact</Text>
              <Text style={styles.actionSub}>So Call Family and Share Location work instantly</Text>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        {/* Life-threatening advice */}
        <View style={styles.warning}>
          <Text style={styles.warningTxt}>
            <Text style={styles.warningBold}>If you cannot breathe, are losing consciousness, or chest-pain is severe:</Text> go to the nearest hospital or dial <Text style={{ fontWeight: "800" }}>991</Text> (Zambia national emergency) immediately.
          </Text>
        </View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTxt}>
            ZedPulse is not a substitute for emergency services. Always call a doctor or ambulance for serious symptoms.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
