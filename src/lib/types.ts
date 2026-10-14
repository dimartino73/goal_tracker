import type { GoalMode, Status } from "./stats";

export interface Habit {
  id: string;
  name: string;
  startDate: string;
  goal: number;
  goalMode: GoalMode;
  color: string;
  /** Timme då dygnet byter (0–6). 3 betyder att 00:00–02:59 räknas som gårdagen. */
  rolloverHour: number;
  archived: boolean;
  createdAt: string;
  /** Klientens ändringstid (ISO). Nyast vinner vid synk. */
  updatedAt: string;
}

export interface DayRec {
  s: Status;
  /** ISO-tid för ändringen. */
  u: string;
}

export interface LocalState {
  habits: Record<string, Habit>;
  days: Record<string, Record<string, DayRec>>;
  /** Vanor och dagar som ännu inte nått servern. Dagar anges som "habitId|dag". */
  dirtyHabits: string[];
  dirtyDays: string[];
  /** Största server_ts vi hämtat per tabell. */
  pulledHabits: string | null;
  pulledDays: string | null;
}

export const emptyState = (): LocalState => ({
  habits: {},
  days: {},
  dirtyHabits: [],
  dirtyDays: [],
  pulledHabits: null,
  pulledDays: null,
});

export const HABIT_COLORS = ["#1c7c5d", "#2f6fb5", "#b4572b", "#8a4fb3", "#b08a1e", "#c2475f"];
