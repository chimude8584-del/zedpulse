import { useMemo } from "react";
import { View, Text } from "react-native";
import Svg, { Polyline, Line, Circle, Rect } from "react-native-svg";

import { useTheme } from "@/src/theme";

type Props = {
  values: number[];
  min?: number;
  max?: number;
  height?: number;
  rangeMin?: number;
  rangeMax?: number;
  testID?: string;
};

export function MiniLineChart({ values, min, max, height = 140, rangeMin, rangeMax, testID }: Props) {
  const { colors } = useTheme();
  const width = 320;
  const padding = { top: 10, right: 10, bottom: 10, left: 10 };

  const { points, lo, hi } = useMemo(() => {
    if (values.length === 0) return { points: "", lo: 0, hi: 1 };
    const lo = min ?? Math.min(...values) - 0.5;
    const hi = max ?? Math.max(...values) + 0.5;
    const span = Math.max(hi - lo, 0.0001);
    const w = width - padding.left - padding.right;
    const h = height - padding.top - padding.bottom;
    const step = values.length > 1 ? w / (values.length - 1) : 0;
    const pts = values.map((v, i) => {
      const x = padding.left + i * step;
      const y = padding.top + h - ((v - lo) / span) * h;
      return `${x},${y}`;
    }).join(" ");
    return { points: pts, lo, hi };
  }, [values, min, max, height]);

  if (values.length === 0) {
    return (
      <View testID={testID} style={{ height, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>No data yet</Text>
      </View>
    );
  }

  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const span = Math.max(hi - lo, 0.0001);

  const rangeY1 = rangeMax != null ? padding.top + h - ((rangeMax - lo) / span) * h : null;
  const rangeY2 = rangeMin != null ? padding.top + h - ((rangeMin - lo) / span) * h : null;

  return (
    <View testID={testID}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {rangeY1 != null && rangeY2 != null ? (
          <Rect
            x={padding.left}
            y={rangeY1}
            width={w}
            height={Math.max(rangeY2 - rangeY1, 1)}
            fill={colors.brandSecondary}
            opacity={0.6}
          />
        ) : null}
        <Line x1={padding.left} y1={padding.top + h} x2={padding.left + w} y2={padding.top + h} stroke={colors.border} strokeWidth={1} />
        <Polyline
          points={points}
          fill="none"
          stroke={colors.brand}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((v, i) => {
          const step = values.length > 1 ? w / (values.length - 1) : 0;
          const x = padding.left + i * step;
          const y = padding.top + h - ((v - lo) / span) * h;
          return <Circle key={i} cx={x} cy={y} r={3} fill={colors.brand} />;
        })}
      </Svg>
    </View>
  );
}
