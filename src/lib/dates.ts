// Alla datum är rena kalenderdatum ("2026-10-14"), aldrig tidpunkter. Räkningen
// görs i UTC så att sommartidsbyten aldrig kan ge en dag för mycket eller lite.

export const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export const MONTHS_LONG = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];
export const WEEKDAYS_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDay(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatDay(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(day: string, n: number): string {
  return formatDay(parseDay(day) + n * 86400000);
}

/**
 * Dagens datum. `rolloverHour` flyttar dygnsgränsen: med 3 räknas tiden
 * 00:00–02:59 som gårdagen, så en registrering efter midnatt hamnar rätt.
 */
export function todayFor(rolloverHour: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - rolloverHour * 3600000);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/** "14 okt", eller "14 okt 2027" när året inte är innevarande år. */
export function shortLabel(day: string, currentYear?: number): string {
  const d = new Date(parseDay(day));
  const y = d.getUTCFullYear();
  const base = `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
  return currentYear !== undefined && y !== currentYear ? `${base} ${y}` : base;
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return formatDay(Date.UTC(y, m - 1 + delta, 1)).slice(0, 7);
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Antal tomma rutor före den 1:a när veckan börjar på måndag. */
export function leadingBlanks(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}
