import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Pill, Activity, HeartPulse, Package, Store } from "lucide-react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  subtitle: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 13, marginBottom: spacing.md },
  search: { marginHorizontal: spacing.xl, marginBottom: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: c.onSurface },
  chipScroll: { paddingBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  chipActive: { backgroundColor: c.brandSecondary, borderColor: c.brand },
  chipTxt: { fontSize: 13, color: c.onSurfaceTertiary, fontWeight: "600" },
  chipTxtActive: { color: c.onBrandSecondary },
  item: { marginHorizontal: spacing.xl, marginBottom: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  itemName: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  itemPack: { fontSize: 12, color: c.muted, marginTop: 2 },
  priceCol: { alignItems: "flex-end" },
  priceRange: { fontSize: 15, fontWeight: "800", color: c.brand, fontVariant: ["tabular-nums"] },
  priceLabel: { fontSize: 11, color: c.muted, marginTop: 2 },
  note: { marginTop: spacing.sm, fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 18 },
  stockistWrap: { marginTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stockistPill: { backgroundColor: c.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  stockistTxt: { fontSize: 11, color: c.onBrandTertiary, fontWeight: "600" },
  stockistSection: { marginTop: spacing.lg, marginHorizontal: spacing.xl, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  stockistTitle: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  stockistRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  stockistName: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  stockistNote: { fontSize: 12, color: c.muted, marginTop: 2 },
  disclaimer: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  disclaimerTxt: { fontSize: 12, color: c.onBrandTertiary, lineHeight: 18 },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyTxt: { color: c.muted, fontSize: 14 },
}));

const CATEGORIES = [
  { key: "all", label: "All", Icon: Package },
  { key: "medication", label: "Medications", Icon: Pill },
  { key: "testing", label: "Testing kits", Icon: Activity },
  { key: "monitor", label: "BP monitors", Icon: HeartPulse },
];

export default function Pharmacy() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const itemsQ = useQuery({ queryKey: ["pharmacy-items"], queryFn: () => api.pharmacyItems() });
  const stockistsQ = useQuery({ queryKey: ["pharmacy-stockists"], queryFn: () => api.pharmacyStockists() });

  const filtered = useMemo(() => {
    let items = itemsQ.data || [];
    if (category !== "all") items = items.filter((i: any) => i.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i: any) => i.name.toLowerCase().includes(q) || (i.note || "").toLowerCase().includes(q));
    }
    return items;
  }, [itemsQ.data, category, search]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="pharm-back" style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Pharmacy watch</Text>
      </View>
      <Text style={styles.subtitle}>Typical Zambian prices in Kwacha for common meds, strips & monitors.</Text>

      <View style={styles.search}>
        <Search size={16} color={colors.muted} />
        <TextInput
          testID="pharm-search"
          style={styles.searchInput}
          placeholder="Search e.g. metformin, strips, omron"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}
        style={styles.chipScroll}
      >
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          const Icon = c.Icon;
          return (
            <TouchableOpacity
              key={c.key}
              testID={`pharm-cat-${c.key}`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(c.key)}
            >
              <Icon size={14} color={active ? colors.onBrandSecondary : colors.onSurfaceTertiary} />
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {itemsQ.isLoading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i: any) => i.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          renderItem={({ item: i }: any) => (
            <View style={styles.item} testID={`pharm-${i.id}`}>
              <View style={styles.itemTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{i.name}</Text>
                  <Text style={styles.itemPack}>{i.pack}</Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.priceRange}>K{i.price_low}–{i.price_high}</Text>
                  <Text style={styles.priceLabel}>typical range</Text>
                </View>
              </View>
              {i.note ? <Text style={styles.note}>{i.note}</Text> : null}
              {i.available_at?.length ? (
                <View style={styles.stockistWrap}>
                  {i.available_at.map((s: string, idx: number) => (
                    <View key={idx} style={styles.stockistPill}>
                      <Text style={styles.stockistTxt}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={styles.emptyTxt}>No items match.</Text>
            </View>
          )}
          ListFooterComponent={() => (
            <>
              {stockistsQ.data?.length ? (
                <View style={styles.stockistSection}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Store size={14} color={colors.brand} />
                    <Text style={styles.stockistTitle}>Where to buy</Text>
                  </View>
                  {stockistsQ.data.map((s: any, idx: number) => (
                    <View key={idx} style={styles.stockistRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stockistName}>{s.name}</Text>
                        <Text style={styles.stockistNote}>{s.note}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.disclaimer}>
                <Text style={styles.disclaimerTxt}>
                  Prices are typical retail estimates in ZMW and vary by branch and brand. Always confirm with the pharmacy. Government clinics may stock essential meds free of charge.
                </Text>
              </View>
            </>
          )}
        />
      )}
    </View>
  );
}
