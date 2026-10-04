// Local notification scheduling (no remote push).
// Works in Expo Go on iOS and Android for daily local reminders.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

const MAP_KEY = "glucobp.reminder.notifId";

// Keep a per-reminder notification id map in storage.
async function getMap(): Promise<Record<string, string>> {
  const v = await storage.getItem<string>(MAP_KEY, "{}");
  try {
    return JSON.parse(v || "{}");
  } catch {
    return {};
  }
}
async function setMap(m: Record<string, string>) {
  await storage.setItem(MAP_KEY, JSON.stringify(m));
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<"granted" | "denied" | "blocked"> {
  if (Platform.OS === "web") return "denied";
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  if (!current.canAskAgain) return "blocked";
  const req = await Notifications.requestPermissionsAsync();
  if (req.granted) return "granted";
  return req.canAskAgain ? "denied" : "blocked";
}

export async function scheduleDailyReminder(
  reminderId: string,
  label: string,
  time: string, // "HH:MM"
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) return null;
  // Cancel existing first
  await cancelReminder(reminderId);
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: "VitaTrack reminder", body: label },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: h,
      minute: m,
    } as any,
  });
  const map = await getMap();
  map[reminderId] = id;
  await setMap(map);
  return id;
}

export async function cancelReminder(reminderId: string) {
  if (Platform.OS === "web") return;
  const map = await getMap();
  const nid = map[reminderId];
  if (nid) {
    try {
      await Notifications.cancelScheduledNotificationAsync(nid);
    } catch {}
    delete map[reminderId];
    await setMap(map);
  }
}
