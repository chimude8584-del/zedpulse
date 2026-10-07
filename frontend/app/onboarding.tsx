import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Dimensions, FlatList, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Activity, HeartPulse, Sparkles, ShieldCheck, ChevronRight } from "lucide-react-native";

import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ONBOARDED_KEY = "zedpulse.onboarded";

const SLIDES = [
  {
    key: "track",
    Icon: Activity,
    title: "Log in seconds",
    body: "Track your blood sugar in mmol/L and your blood pressure in mmHg. Context chips (fasting, after meal, bedtime) take one tap.",
  },
  {
    key: "insights",
    Icon: HeartPulse,
    title: "See your trends",
    body: "A clear chart with the healthy range shaded in, plus a weekly summary of time-in-range, BP averages and medication adherence.",
  },
  {
    key: "advice",
    Icon: Sparkles,
    title: "Zambia-aware AI tips",
    body: "Ask about nshima portions, kapenta salt, or hypo rescue. The advisor speaks in Zambian foods and local pharmacy prices.",
  },
  {
    key: "share",
    Icon: ShieldCheck,
    title: "Share with your doctor",
    body: "Send a 7-day read-only link or a PDF report straight from the app — your clinician doesn't need to install anything.",
  },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  slide: { width: SCREEN_WIDTH, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  iconWrap: { width: 120, height: 120, borderRadius: 60, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, textAlign: "center", letterSpacing: -0.5, marginBottom: spacing.md },
  body: { fontSize: 16, color: c.muted, textAlign: "center", lineHeight: 24, maxWidth: 320 },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { height: 8, borderRadius: 4, backgroundColor: c.border },
  dotActive: { backgroundColor: c.brand, width: 24 },
  dotInactive: { width: 8 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  skip: { padding: spacing.md },
  skipTxt: { color: c.muted, fontSize: 14, fontWeight: "600" },
  next: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  nextTxt: { color: c.onBrandPrimary, fontSize: 15, fontWeight: "700" },
}));

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  async function finish() {
    await storage.setItem(ONBOARDED_KEY, "1");
    router.replace("/(tabs)");
  }

  function next() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      finish();
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="onboarding">
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setIndex(i);
        }}
        renderItem={({ item }) => (
          <View style={styles.slide} testID={`slide-${item.key}`}>
            <View style={styles.iconWrap}>
              <item.Icon size={56} color={colors.brand} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity testID="onb-skip" style={styles.skip} onPress={finish}>
            <Text style={styles.skipTxt}>{index === SLIDES.length - 1 ? "" : "Skip"}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="onb-next" style={styles.next} onPress={next}>
            <Text style={styles.nextTxt}>
              {index === SLIDES.length - 1 ? "Get started" : "Next"}
            </Text>
            {index < SLIDES.length - 1 && <ChevronRight size={16} color={colors.onBrandPrimary} />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
