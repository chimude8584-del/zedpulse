import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image, TextInput, FlatList, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Camera, ImagePlus, Search, Check, AlertCircle, Utensils } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  subtitle: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.md },
  segmentRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  segment: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  segmentActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  segmentTxt: { fontSize: 14, fontWeight: "600", color: c.onSurfaceTertiary },
  segmentTxtActive: { color: c.onBrandPrimary },
  shotCard: { marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", gap: spacing.md },
  preview: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.xl, alignItems: "center", flexDirection: "row", gap: 6 },
  btnTxt: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  altBtn: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: 6 },
  altBtnTxt: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  resultCard: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.brandSecondary },
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  totalCarbs: { fontSize: 32, fontWeight: "800", color: c.onBrandSecondary, fontVariant: ["tabular-nums"] },
  totalUnit: { fontSize: 14, color: c.onBrandSecondary, opacity: 0.8 },
  foodItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.surfaceSecondary },
  foodName: { fontSize: 14, fontWeight: "600", color: c.onBrandSecondary },
  foodMeta: { fontSize: 12, color: c.onBrandSecondary, opacity: 0.75, marginTop: 2 },
  tipBox: { marginTop: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderRadius: radius.md },
  tipTxt: { fontSize: 13, color: c.onSurface, lineHeight: 18 },
  glBadge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start", marginTop: spacing.sm },
  glBadgeTxt: { fontSize: 12, fontWeight: "700" },
  search: { marginHorizontal: spacing.xl, marginBottom: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: c.onSurface },
  libRow: { marginHorizontal: spacing.xl, marginBottom: spacing.sm, padding: spacing.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  libName: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  libSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  carbPill: { backgroundColor: c.brandSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  carbPillTxt: { color: c.onBrandSecondary, fontSize: 12, fontWeight: "700" },
  err: { color: c.error, marginHorizontal: spacing.xl, fontSize: 13, marginTop: spacing.sm },
}));

function glColor(gl: string | undefined, colors: any) {
  if (gl === "low") return { bg: colors.success + "33", fg: colors.success };
  if (gl === "medium") return { bg: colors.warning + "33", fg: colors.warning };
  if (gl === "high") return { bg: colors.error + "33", fg: colors.error };
  return { bg: colors.surfaceTertiary, fg: colors.muted };
}

export default function FoodScanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"scan" | "library">("scan");
  const [image, setImage] = useState<{ uri: string; base64: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const lib = useQuery({ queryKey: ["food-library"], queryFn: () => api.foodLibrary() });

  const scanMut = useMutation({
    mutationFn: (b64: string) => api.scanFood(b64),
    onSuccess: (r) => setResult(r),
    onError: (e: any) => setError(e.message || "Scan failed"),
  });
  const logMut = useMutation({
    mutationFn: (body: { name: string; carbs_g: number; portion?: string }) => api.logFood(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["food-scans"] }),
  });

  async function pickFromCamera() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError("Camera permission denied"); return; }
    const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, allowsEditing: true });
    handlePicked(r);
  }
  async function pickFromGallery() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError("Gallery permission denied"); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, allowsEditing: true });
    handlePicked(r);
  }
  function handlePicked(r: ImagePicker.ImagePickerResult) {
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (!a.base64) { setError("Could not read image"); return; }
    setImage({ uri: a.uri, base64: a.base64 });
    setResult(null);
    scanMut.mutate(a.base64);
  }

  function logResult() {
    if (!result?.total_carbs_g) return;
    const nameParts = (result.foods || []).map((f: any) => f.name).filter(Boolean).join(", ") || "Scanned meal";
    logMut.mutate({ name: nameParts, carbs_g: result.total_carbs_g });
  }

  const filteredLib = (lib.data || []).filter((f: any) =>
    !search.trim() || f.name.toLowerCase().includes(search.toLowerCase()),
  );

  const gl = glColor(result?.glycemic_load, colors);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="food-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Food scanner</Text>
      </View>
      <Text style={styles.subtitle}>Snap a photo or pick a Zambian dish — see carbs instantly.</Text>

      <View style={styles.segmentRow}>
        <TouchableOpacity
          testID="food-tab-scan"
          style={[styles.segment, mode === "scan" && styles.segmentActive]}
          onPress={() => setMode("scan")}
        >
          <Camera size={16} color={mode === "scan" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
          <Text style={[styles.segmentTxt, mode === "scan" && styles.segmentTxtActive]}>Scan photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="food-tab-library"
          style={[styles.segment, mode === "library" && styles.segmentActive]}
          onPress={() => setMode("library")}
        >
          <Utensils size={16} color={mode === "library" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
          <Text style={[styles.segmentTxt, mode === "library" && styles.segmentTxtActive]}>Zambian foods</Text>
        </TouchableOpacity>
      </View>

      {mode === "scan" ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
          <View style={styles.shotCard}>
            {image ? (
              <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <View style={[styles.preview, { alignItems: "center", justifyContent: "center" }]}>
                <Camera size={32} color={colors.muted} />
                <Text style={{ color: colors.muted, marginTop: 8 }}>No photo yet</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TouchableOpacity testID="food-shoot" style={styles.btn} onPress={pickFromCamera}>
                <Camera size={16} color={colors.onBrandPrimary} />
                <Text style={styles.btnTxt}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="food-gallery" style={styles.altBtn} onPress={pickFromGallery}>
                <ImagePlus size={16} color={colors.onSurface} />
                <Text style={styles.altBtnTxt}>Gallery</Text>
              </TouchableOpacity>
            </View>
            {Platform.OS === "web" && (
              <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
                Camera opens on your phone — scan the QR to try it in Expo Go.
              </Text>
            )}
          </View>

          {error && <Text style={styles.err} testID="food-err">{error}</Text>}

          {scanMut.isPending && (
            <View style={{ padding: spacing.lg, alignItems: "center" }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={{ color: colors.muted, marginTop: 8 }}>Analyzing your meal…</Text>
            </View>
          )}

          {result && (
            <View style={styles.resultCard} testID="food-result">
              <View style={styles.totalRow}>
                <Text style={styles.totalCarbs}>{result.total_carbs_g ?? "?"}</Text>
                <Text style={styles.totalUnit}>g carbs total</Text>
              </View>
              {result.glycemic_load && (
                <View style={[styles.glBadge, { backgroundColor: gl.bg }]}>
                  <Text style={[styles.glBadgeTxt, { color: gl.fg }]}>GL: {result.glycemic_load}</Text>
                </View>
              )}
              <View style={{ marginTop: spacing.md, width: "100%" }}>
                {(result.foods || []).map((f: any, i: number) => (
                  <View key={i} style={styles.foodItem}>
                    <Text style={styles.foodName}>{f.name}</Text>
                    <Text style={styles.foodMeta}>{f.portion} · {f.carbs_g} g</Text>
                  </View>
                ))}
                {(result.foods || []).length === 0 && (
                  <Text style={styles.foodMeta}>No food detected. Try a clearer photo.</Text>
                )}
              </View>
              {result.diabetes_tips ? (
                <View style={styles.tipBox}>
                  <Text style={styles.tipTxt}>💡 {result.diabetes_tips}</Text>
                </View>
              ) : null}
              {result.zambia_note ? (
                <View style={styles.tipBox}>
                  <Text style={styles.tipTxt}>🇿🇲 {result.zambia_note}</Text>
                </View>
              ) : null}
              {result.total_carbs_g > 0 && (
                <TouchableOpacity testID="food-log" style={[styles.btn, { marginTop: spacing.md }]} onPress={logResult} disabled={logMut.isPending}>
                  {logMut.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                    <>
                      <Check size={16} color={colors.onBrandPrimary} />
                      <Text style={styles.btnTxt}>Log this meal</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          <View style={styles.search}>
            <Search size={16} color={colors.muted} />
            <TextInput
              testID="food-search"
              style={styles.searchInput}
              placeholder="Search e.g. nshima, kapenta"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <FlatList
            data={filteredLib}
            keyExtractor={(f) => f.name}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
            renderItem={({ item: f }) => (
              <TouchableOpacity
                testID={`food-lib-${f.name}`}
                style={styles.libRow}
                onPress={() => logMut.mutate({ name: f.name, carbs_g: f.carbs_g, portion: f.portion })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.libName}>{f.name}</Text>
                  <Text style={styles.libSub}>{f.portion} · GI {f.gi} · {f.tip}</Text>
                </View>
                <View style={styles.carbPill}>
                  <Text style={styles.carbPillTxt}>{f.carbs_g}g</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <View style={{ padding: spacing.xl, alignItems: "center" }}>
                <AlertCircle size={24} color={colors.muted} />
                <Text style={{ color: colors.muted, marginTop: 8 }}>No matches</Text>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}
