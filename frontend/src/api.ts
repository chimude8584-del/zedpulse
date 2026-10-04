// API client — talks to FastAPI backend using EXPO_PUBLIC_BACKEND_URL.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "glucobp.auth.token";

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
};
