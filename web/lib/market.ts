import type { MarketStatus } from "./types";

/** NYSE is typically closed these observed dates. Veterans Day is not an NYSE holiday. */
const NYSE_HOLIDAYS = new Set([
  // 2026
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03", // Independence Day observed (Jul 4 is Saturday)
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18", // Juneteenth observed (Jun 19 is Saturday)
  "2027-07-05", // Independence Day observed (Jul 4 is Sunday)
  "2027-09-06",
  "2027-11-25",
  "2027-12-24", // Christmas observed (Dec 25 is Saturday)
]);

const ET = "America/New_York";
const WAT = "Africa/Lagos";

function ymdInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function hmInZone(date: Date, timeZone: string): { h: number; m: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { h: Number(get("hour")), m: Number(get("minute")), weekday: get("weekday") };
}

function formatClock(date: Date, timeZone: string, suffix: string): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${text} ${suffix}`;
}

export function getMarketStatus(now = new Date()): MarketStatus {
  const sessionDateEt = ymdInZone(now, ET);
  const { h, m, weekday } = hmInZone(now, ET);
  const minutes = h * 60 + m;
  const openMinute = 9 * 60 + 30;
  const closeMinute = 16 * 60;
  const weekend = weekday === "Sat" || weekday === "Sun";
  const holiday = NYSE_HOLIDAYS.has(sessionDateEt);
  const inSession = minutes >= openMinute && minutes < closeMinute;
  const open = !weekend && !holiday && inSession;

  let reason: string;
  if (weekend) reason = "Weekend — US cash session is closed; tokenized stocks can still trade onchain.";
  else if (holiday) reason = `NYSE holiday (${sessionDateEt}) — cash session closed; feeds typically hold the last value.`;
  else if (!inSession && minutes < openMinute) reason = "Pre-open in New York. Official NAV feeds may still be holding the prior session.";
  else if (!inSession) reason = "After the cash close in New York. This is the window AfterHours is built for.";
  else reason = "US cash session is open (09:30–16:00 ET).";

  return {
    open,
    label: open ? "Market open" : "Market closed",
    reason,
    nowEt: formatClock(now, ET, "ET"),
    nowWat: formatClock(now, WAT, "WAT"),
    sessionDateEt,
  };
}

export function minutesSince(iso?: string, now = new Date()): number | undefined {
  if (!iso) return undefined;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return undefined;
  return Math.max(0, Math.round((now.getTime() - then) / 60000));
}

export function classifyFeed(
  navUpdatedAt: string | undefined,
  market: MarketStatus,
  now = new Date(),
): { state: import("./types").FeedState; ageMinutes?: number } {
  if (!navUpdatedAt) return { state: "none" };
  const ageMinutes = minutesSince(navUpdatedAt, now);
  if (ageMinutes === undefined) return { state: "none" };
  if (ageMinutes <= 120) return { state: "live", ageMinutes };
  if (ageMinutes <= 24 * 60) {
    return { state: market.open ? "aging" : "holding", ageMinutes };
  }
  return { state: market.open ? "stale" : "holding", ageMinutes };
}
