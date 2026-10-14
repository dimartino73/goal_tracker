import { addDays, monthKey } from "./dates";

export type Status = "done" | "miss" | "none";
export type GoalMode = "streak" | "total";

/** Dag → status. Saknas dagen, eller är den 'none', är den "ej angiven". */
export type DayMap = Record<string, Status | undefined>;

export interface Streak {
  len: number;
  /** Första dagen som INTE räknades (den som bröt perioden). */
  brokenOn: string;
}

export interface MonthStat {
  done: number;
  /** Dagar som räknas in i månaden: alla hittills utom en ännu oregistrerad idag. */
  days: number;
}

export interface Stats {
  current: number;
  longest: number;
  total: number;
  breaks: Streak[];
  months: Record<string, MonthStat>;
}

/**
 * Räknar allt ur dagposterna. Inget är lagrat: rättar du en dag bakåt räknas
 * hela historiken om.
 *
 * En oregistrerad IDAG bryter inte streaken, för dagen är inte slut. Är
 * idag uttryckligen markerad som missad är streaken noll.
 *
 * VIKTIGT: widget/dagraknare.js har en kopia av den här logiken (Scriptable
 * kan inte importera från appen). stats.test.ts jämför de två.
 */
export function computeStats(days: DayMap, startDate: string, today: string): Stats {
  let total = 0, longest = 0, run = 0;
  const breaks: Streak[] = [];
  const months: Record<string, MonthStat> = {};

  for (let d = startDate; d <= today; d = addDays(d, 1)) {
    const v = days[d];
    const k = monthKey(d);
    const m = (months[k] ??= { done: 0, days: 0 });
    const pending = d === today && (v === undefined || v === "none");
    if (!pending) m.days++;

    if (v === "done") {
      total++; run++; m.done++;
      if (run > longest) longest = run;
    } else if (!pending) {
      if (run > 0) breaks.push({ len: run, brokenOn: d });
      run = 0;
    }
  }

  let current = 0;
  let p: string | null;
  if (days[today] === "done") p = today;
  else if (days[today] === "miss") p = null;
  else p = addDays(today, -1);
  while (p && p >= startDate && days[p] === "done") {
    current++;
    p = addDays(p, -1);
  }

  return { current, longest, total, breaks, months };
}

export function goalProgress(stats: Pick<Stats, "current" | "total">, mode: GoalMode): number {
  return mode === "streak" ? stats.current : stats.total;
}

export function daysLeft(progress: number, goal: number): number {
  return Math.max(0, goal - progress);
}

export function goalUnit(mode: GoalMode): string {
  return mode === "streak" ? "dagar i rad" : "dagar totalt";
}

/** Antal dagar som lagts till eller tagits bort i målräknaren efter en ändring. */
export function describeChange(before: number, after: number, mode: GoalMode): string {
  const label = mode === "streak" ? "Dagar i rad" : "Dagar totalt";
  if (before === after) return mode === "streak" ? "Ingen ändring i dagar i rad." : "Ingen ändring i antalet dagar.";
  const merged = mode === "streak" && after - before > 1 ? " (två perioder slogs ihop)" : "";
  return `${label}: ${before} → ${after}${merged}`;
}
