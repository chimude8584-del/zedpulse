import { useState, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, FlatList, ScrollView, ActivityIndicator, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { ArrowLeft, MapPin, Phone, Hospital, Navigation } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  locBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  chipsRow: { paddingHorizontal: spacing.xl, flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.md },
  chipScroll: { paddingBottom: spacing.md, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  chipActive: { backgroundColor: c.brandSecondary, borderColor: c.brand },
  chipTxt: { fontSize: 13, color: c.onSurfaceTertiary, fontWeight: "600" },
  chipTxtActive: { color: c.onBrandSecondary },
  item: { marginHorizontal: spacing.xl, marginBottom: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  itemTop: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  iconBubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  itemMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
  dist: { fontSize: 12, color: c.brand, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  actionTxt: { color: c.onSurface, fontSize: 13, fontWeight: "600" },
  callBtn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  callBtnTxt: { color: c.onBrandPrimary },
  helper: { marginHorizontal: spacing.xl, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary, marginBottom: spacing.md },
  helperTxt: { fontSize: 12, color: c.onBrandTertiary },
}));

const CITIES = ["All", "Lusaka", "Ndola", "Kitwe", "Livingstone", "Chingola", "Kabwe", "Chipata", "Mongu", "Solwezi", "Kasama", "Choma"];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export default function Clinics() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [city, setCity] = useState<string>("All");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["clinics"], queryFn: () => api.listClinics() });

  const items = useMemo(() => {
    let list = q.data || [];
    if (city !== "All") list = list.filter((c: any) => c.city === city);
    if (loc) {
      list = list
        .map((c: any) => ({ ...c, _distance: distanceKm(loc.lat, loc.lng, c.lat, c.lng) }))
        .sort((a: any, b: any) => a._distance - b._distance);
    }
    return list;
  }, [q.data, city, loc]);

  async function useMyLocation() {
    setLocError(null);
    setLocBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocError("Location permission denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e: any) {
      setLocError(e.message || "Could not get location");
    } finally {
      setLocBusy(false);
    }
  }

  function openMaps(c: any) {
    const url = Platform.select({
      ios: `maps:0,0?q=${c.lat},${c.lng}(${encodeURIComponent(c.name)})`,
      android: `geo:0,0?q=${c.lat},${c.lng}(${encodeURIComponent(c.name)})`,
      default: `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`,
    }) as string;
    Linking.openURL(url).catch(() => {});
  }
  function call(c: any) {
    if (!c.phone) return;
    Linking.openURL(`tel:${c.phone}`).catch(() => {});
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="clinic-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Nearby clinics</Text>
        <TouchableOpacity testID="clinic-loc" style={styles.locBtn} onPress={useMyLocation} disabled={locBusy}>
          {locBusy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Navigation size={18} color={colors.onBrandPrimary} />}
        </TouchableOpacity>
      </View>

      {locError && (
        <View style={styles.helper}>
          <Text style={styles.helperTxt}>{locError}</Text>
        </View>
      )}
      {loc && (
        <View style={styles.helper}>
          <Text style={styles.helperTxt}>Sorted by distance from your current location.</Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}
        style={styles.chipScroll}
      >
        {CITIES.map((c) => {
          const active = city === c;
          return (
            <TouchableOpacity
              key={c}
              testID={`clinic-city-${c}`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCity(c)}
            >
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {q.isLoading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c: any) => c.name}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          renderItem={({ item: c }: any) => (
            <View style={styles.item} testID={`clinic-${c.name}`}>
              <View style={styles.itemTop}>
                <View style={styles.iconBubble}>
                  <Hospital size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{c.name}</Text>
                  <Text style={styles.itemMeta}>{c.city} · {c.type}</Text>
                </View>
                {c._distance != null && (
                  <Text style={styles.dist}>{c._distance.toFixed(1)} km</Text>
                )}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.action} onPress={() => openMaps(c)} testID={`clinic-nav-${c.name}`}>
                  <MapPin size={14} color={colors.onSurface} />
                  <Text style={styles.actionTxt}>Directions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.action, styles.callBtn]} onPress={() => call(c)} testID={`clinic-call-${c.name}`}>
                  <Phone size={14} color={colors.onBrandPrimary} />
                  <Text style={[styles.actionTxt, styles.callBtnTxt]}>Call</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
