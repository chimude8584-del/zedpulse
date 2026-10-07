import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Timer, Check, AlertTriangle } from "lucide-react-native";

import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const DURATION = 15 * 60; // 15 minutes

const useStyles = makeStyles((c) => ({
  card: {
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderLeftWidth: 4, borderLeftColor: c.error, gap: spacing.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  body: { fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 18 },
  timerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  timeBig: { fontSize: 36, fontWeight: "800", color: c.error, fontVariant: ["tabular-nums"], letterSpacing: -1 },
  timeLabel: { fontSize: 12, color: c.muted, flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: {
    flex: 1, backgroundColor: c.brandPrimary, borderRadius: radius.md,
    paddingVertical: 10, alignItems: "center", flexDirection: "row",
    justifyContent: "center", gap: 6,
  },
  actionTxt: { color: c.onBrandPrimary, fontSize: 13, fontWeight: "600" },
  secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  secondaryTxt: { color: c.onSurface },
  done: {
    marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: c.success + "22", alignItems: "center",
  },
  doneTxt: { color: c.success, fontSize: 14, fontWeight: "700" },
}));

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Props = {
  severity: "warning" | "critical";
  onRecheck: () => void;
};

export function HypoRescueCard({ severity, onRecheck }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [remaining, setRemaining] = useState(DURATION);
  const [carbsTaken, setCarbsTaken] = useState(false);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current as any);
          setDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <View style={styles.card} testID="hypo-rescue-card">
      <View style={styles.head}>
        <AlertTriangle size={18} color={colors.error} />
        <Text style={styles.title}>Hypo rescue — act now</Text>
      </View>
      <Text style={styles.body}>
        {severity === "critical"
          ? "Take 20 g fast-acting carbs now (sugar water, glucose tablets, 1 cup regular soda). If you cannot swallow or feel confused, ask someone to call for help."
          : "Take 15 g fast-acting carbs (3–4 glucose tablets, 1/2 cup fruit juice, 1 tablespoon sugar in water). Then recheck in 15 minutes."}
      </Text>
      <View style={styles.timerRow}>
        <Timer size={28} color={colors.error} />
        <Text style={styles.timeBig} testID="hypo-timer">{fmt(remaining)}</Text>
        <Text style={styles.timeLabel}>until recheck</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          testID="hypo-carbs"
          style={[styles.action, carbsTaken && styles.secondary]}
          onPress={() => setCarbsTaken(true)}
          disabled={carbsTaken}
        >
          <Check size={14} color={carbsTaken ? colors.onSurface : colors.onBrandPrimary} />
          <Text style={[styles.actionTxt, carbsTaken && styles.secondaryTxt]}>
            {carbsTaken ? "Carbs taken ✓" : "I had rescue carbs"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="hypo-recheck"
          style={[styles.action, styles.secondary]}
          onPress={onRecheck}
        >
          <Text style={[styles.actionTxt, styles.secondaryTxt]}>Recheck now</Text>
        </TouchableOpacity>
      </View>
      {done && (
        <View style={styles.done}>
          <Text style={styles.doneTxt}>⏰ Time to recheck your glucose</Text>
        </View>
      )}
    </View>
  );
}
