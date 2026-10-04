// Shared helpers for formatting readings.

export function fmtDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  } catch {
    return iso;
  }
}

export function severityColor(severity: string | undefined, colors: any): string {
  switch (severity) {
    case "critical":
      return colors.error;
    case "warning":
      return colors.warning;
    case "watch":
      return colors.warning;
    case "ok":
      return colors.success;
    default:
      return colors.muted;
  }
}

export const contextLabels: Record<string, string> = {
  fasting: "Fasting",
  before_meal: "Before meal",
  after_meal: "After meal",
  bedtime: "Bedtime",
  random: "Random",
};
