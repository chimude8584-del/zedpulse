// Design tokens — Botanical Sage theme (light + dark).
// Keys match the `color` block of design_guidelines. Use pairs: `key` background
// + `onKey` for text/icon on top. Build sheets via `makeStyles((colors) => ...)`.

import { useEffect, useMemo, useState } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

import { storage } from "@/src/utils/storage";

export type ColorScheme = "light" | "dark";
export type ThemePref = "system" | "light" | "dark";

const PREF_KEY = "zedpulse.theme-pref";
let currentPref: ThemePref = "system";
const listeners = new Set<() => void>();

const light = {
  // Surfaces — warm off-whites
  surface: "#FBFAF6",
  onSurface: "#1C2420",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C2420",
  surfaceTertiary: "#F1EFE8",
  onSurfaceTertiary: "#3A443F",
  surfaceInverse: "#1F2A24",
  onSurfaceInverse: "#F5F3EC",
  muted: "#6B766F",

  // Brand — sage green
  brand: "#4A6B53",
  onBrand: "#FFFFFF",
  brandPrimary: "#4A6B53",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#DCE4D8",
  onBrandSecondary: "#2B3A2F",
  brandTertiary: "#EDEFE6",
  onBrandTertiary: "#2B3A2F",

  // Status — botanical/earthy semantics
  success: "#4A6B53",
  onSuccess: "#FFFFFF",
  warning: "#C78A2F", // warm amber for hyper/stage-1
  onWarning: "#FFFFFF",
  error: "#B5655C", // muted terracotta for severe alerts
  onError: "#FFFFFF",
  info: "#546E82",
  onInfo: "#FFFFFF",

  // Lines
  border: "#E3E0D6",
  borderStrong: "#C8C3B4",
  divider: "#ECE9DF",
};

const dark: typeof light = {
  surface: "#121613",
  onSurface: "#ECEBE4",
  surfaceSecondary: "#1A1F1B",
  onSurfaceSecondary: "#ECEBE4",
  surfaceTertiary: "#232A25",
  onSurfaceTertiary: "#D4D2C9",
  surfaceInverse: "#F1EFE8",
  onSurfaceInverse: "#1C2420",
  muted: "#8E968E",

  brand: "#8CB096",
  onBrand: "#0F1A13",
  brandPrimary: "#8CB096",
  onBrandPrimary: "#0F1A13",
  brandSecondary: "#2B3A2F",
  onBrandSecondary: "#D7E2D9",
  brandTertiary: "#1F2821",
  onBrandTertiary: "#D7E2D9",

  success: "#8CB096",
  onSuccess: "#0F1A13",
  warning: "#E0A95A",
  onWarning: "#1C140A",
  error: "#D08A82",
  onError: "#1C0F0C",
  info: "#9CB4C5",
  onInfo: "#0F1620",

  border: "#2B3330",
  borderStrong: "#3D4541",
  divider: "#242A26",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

// Load preference once from storage on module init.
(async () => {
  try {
    const stored = (await storage.getItem<ThemePref>(PREF_KEY, "system")) as ThemePref;
    if (stored === "light" || stored === "dark" || stored === "system") {
      currentPref = stored;
      listeners.forEach((l) => l());
    }
  } catch {}
})();

export async function setThemePref(pref: ThemePref) {
  currentPref = pref;
  try { await storage.setItem(PREF_KEY, pref); } catch {}
  listeners.forEach((l) => l());
}

export function getThemePref(): ThemePref {
  return currentPref;
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors; pref: ThemePref } {
  const system = useColorScheme();
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const pref = currentPref;
  const effective: ColorScheme =
    pref === "light" ? "light" : pref === "dark" ? "dark" : (system && themes[system] ? system : defaultScheme);
  return { scheme: effective, colors: themes[effective] ?? themes.light, pref };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Spacing & radius tokens (8pt grid)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};
