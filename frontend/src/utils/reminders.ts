// Local notification scheduling (no remote push).
// Works on dev/production builds. On Expo Go Android (SDK 53+) local
// scheduling is limited — we fail soft so the Reminders screen still works
// and the reminder is still saved on the server.
import { Platform } from "react-native";
import Constants from "expo-constants";

import { storage } from "@/src/utils/storage";

const MAP_KEY = "glucobp.reminder.notifId";

// Lazy, defensive load — if the native module is unavailable (web, SSR, Expo
// Go on Android), we return null and callers no-op.
let _notifs: any = null;
function getNotifications(): any | null {
  if (_notifs !== null) return _notifs;
  if (Platform.OS === "web") return (_notifs = null);
  // In Expo Go on Android, remote push is gone; local scheduling can still
  // throw on some devices. Guard the import and the handler setup.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-notifications");
    try {
      mod.setNotificationHandler?.({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch {
      // handler setup is non-fatal
    }
    _notifs = mod;
    return mod;
  } catch {
    _notifs = null;
    return null;
  }
}

export function isExpoGo(): boolean {
  return (Constants as any)?.appOwnership === "expo";
}

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

export async function ensureNotificationPermission(): Promise<
  "granted" | "denied" | "blocked" | "unsupported"
> {
  const Notif = getNotifications();
  if (!Notif) return "unsupported";
  try {
    const current = await Notif.getPermissionsAsync();
    if (current.granted) return "granted";
    if (!current.canAskAgain) return "blocked";
    const req = await Notif.requestPermissionsAsync();
    if (req.granted) return "granted";
    return req.canAskAgain ? "denied" : "blocked";
  } catch {
    return "unsupported";
  }
}

export async function scheduleDailyReminder(
  reminderId: string,
  label: string,
  time: string, // "HH:MM"
): Promise<string | null> {
  const Notif = getNotifications();
  if (!Notif) return null;
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) return null;
  await cancelReminder(reminderId);
  try {
    const id = await Notif.scheduleNotificationAsync({
      content: { title: "ZedPulse reminder", body: label },
      trigger: {
        type: Notif.SchedulableTriggerInputTypes?.DAILY ?? "daily",
        hour: h,
        minute: m,
      } as any,
    });
    const map = await getMap();
    map[reminderId] = id;
    await setMap(map);
    return id;
  } catch {
    return null;
  }
}

export async function cancelReminder(reminderId: string) {
  const Notif = getNotifications();
  if (!Notif) return;
  const map = await getMap();
  const nid = map[reminderId];
  if (nid) {
    try {
      await Notif.cancelScheduledNotificationAsync(nid);
    } catch {}
    delete map[reminderId];
    await setMap(map);
  }
}
