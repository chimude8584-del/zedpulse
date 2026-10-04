// API client — talks to FastAPI backend using EXPO_PUBLIC_BACKEND_URL.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "glucobp.auth.token";

export const PUBLIC_BASE = BASE;

export async function getToken(): Promise<string | null> {
  return storage.secureGet<string>(TOKEN_KEY, "");
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

// Auth
export type AuthResp = { token: string; user: { id: string; phone: string; name?: string | null } };
export const api = {
  signup: (phone: string, passcode: string, name?: string) =>
    request<AuthResp>("/auth/signup", { method: "POST", body: { phone, passcode, name }, auth: false }),
  login: (phone: string, passcode: string) =>
    request<AuthResp>("/auth/login", { method: "POST", body: { phone, passcode }, auth: false }),
  me: () => request<any>("/auth/me"),

  // Glucose
  addGlucose: (body: { value: number; context: string; note?: string }) =>
    request<any>("/readings/glucose", { method: "POST", body }),
  listGlucose: () => request<any[]>("/readings/glucose"),
  deleteGlucose: (id: string) => request<any>(`/readings/glucose/${id}`, { method: "DELETE" }),

  // BP
  addBP: (body: { systolic: number; diastolic: number; pulse?: number; note?: string }) =>
    request<any>("/readings/bp", { method: "POST", body }),
  listBP: () => request<any[]>("/readings/bp"),
  deleteBP: (id: string) => request<any>(`/readings/bp/${id}`, { method: "DELETE" }),

  // Stats
  summary: () => request<any>("/stats/summary"),

  // Advice
  advice: (body: { question?: string; kind?: string }) =>
    request<{ answer: string; id: string }>("/advice", { method: "POST", body }),
  adviceHistory: () => request<any[]>("/advice/history"),

  // Report
  report: () => request<{ text: string; generated_at: string }>("/report"),

  // Reminders
  listReminders: () => request<any[]>("/reminders"),
  addReminder: (body: { label: string; time: string; kind?: string; enabled?: boolean }) =>
    request<any>("/reminders", { method: "POST", body }),
  toggleReminder: (id: string, enabled: boolean) =>
    request<any>(`/reminders/${id}?enabled=${enabled}`, { method: "PATCH" }),
  deleteReminder: (id: string) => request<any>(`/reminders/${id}`, { method: "DELETE" }),

  // Medications
  listMedications: () => request<any[]>("/medications"),
  addMedication: (body: { name: string; dose: string; times_per_day: number; note?: string }) =>
    request<any>("/medications", { method: "POST", body }),
  deleteMedication: (id: string) => request<any>(`/medications/${id}`, { method: "DELETE" }),
  logMedication: (medication_id: string) =>
    request<any>("/medications/log", { method: "POST", body: { medication_id } }),

  // Share
  shareCurrent: () => request<{ token: string | null; expires_at?: string }>("/share/current"),
  shareCreate: () => request<{ token: string; expires_at: string; url: string | null; path: string }>("/share/create", { method: "POST" }),
  shareRevoke: () => request<any>("/share/revoke", { method: "POST" }),

  // Emergency contact
  getEmergencyContact: () => request<{ name: string | null; phone: string | null }>("/profile/emergency-contact"),
  setEmergencyContact: (name: string, phone: string) =>
    request<any>("/profile/emergency-contact", { method: "POST", body: { name, phone } }),
  deleteEmergencyContact: () => request<any>("/profile/emergency-contact", { method: "DELETE" }),

  // Food
  scanFood: (image_base64: string, content_type: string = "image/jpeg") =>
    request<any>("/food/scan", { method: "POST", body: { image_base64, content_type } }),
  foodScans: () => request<any[]>("/food/scans"),
  foodLibrary: () => request<any[]>("/food/library"),
  logFood: (body: { name: string; carbs_g: number; portion?: string }) =>
    request<any>("/food/log", { method: "POST", body }),

  // Clinics
  listClinics: (city?: string) => request<any[]>(`/clinics${city ? `?city=${encodeURIComponent(city)}` : ""}`),

  // Insights
  weeklyInsights: () => request<any>("/insights/weekly"),

  // Pharmacy
  pharmacyItems: (category?: string, q?: string) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    const qs = params.toString();
    return request<any[]>(`/pharmacy/items${qs ? `?${qs}` : ""}`);
  },
  pharmacyStockists: () => request<any[]>("/pharmacy/stockists"),
};
