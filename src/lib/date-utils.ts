export type DatePreset = "today" | "last7" | "lastMonth" | "lastYear" | "custom";

function karachiBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function toDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function presetDateRange(preset: DatePreset, from?: string, to?: string): { from: string; to: string } {
  const today = karachiBusinessDate();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7": {
      const from = addDays(today, -6);
      return { from, to: today };
    }
    case "lastMonth": {
      const current = new Date(`${today}T00:00:00Z`);
      const year = current.getUTCFullYear();
      const month = current.getUTCMonth();
      const startOfCurrentMonth = new Date(Date.UTC(year, month, 1));
      const startOfLastMonth = new Date(Date.UTC(year, month - 1, 1));
      const endOfLastMonth = addDays(startOfCurrentMonth.toISOString().slice(0, 10), -1);
      return { from: startOfLastMonth.toISOString().slice(0, 10), to: endOfLastMonth };
    }
    case "lastYear": {
      const from = addDays(today, -364);
      return { from, to: today };
    }
    case "custom":
      return { from: from ?? today, to: to ?? today };
  }
}

export function detectPreset(from?: string, to?: string): DatePreset | null {
  if (!from || !to) return null;
  const today = karachiBusinessDate();
  if (from === today && to === today) return "today";
  if (from === addDays(today, -6) && to === today) return "last7";
  const current = new Date(`${today}T00:00:00Z`);
  const startOfCurrentMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const endOfLastMonth = addDays(startOfCurrentMonth, -1);
  const startOfLastMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  if (from === startOfLastMonth && to === endOfLastMonth) return "lastMonth";
  if (from === addDays(today, -364) && to === today) return "lastYear";
  return "custom";
}

export function businessDateFilter(from?: string, to?: string): Record<string, unknown> | undefined {
  if (!from && !to) return undefined;
  const filter: Record<string, unknown> = {};
  if (from) filter.$gte = from;
  if (to) filter.$lt = addDays(to, 1);
  return Object.keys(filter).length ? { businessDate: filter } : undefined;
}

export function matchStage(from?: string, to?: string): Record<string, unknown> | undefined {
  const filter = businessDateFilter(from, to);
  return filter ? { $match: filter } : undefined;
}
