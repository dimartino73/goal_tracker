import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { emptyState, type DayRec, type Habit, type LocalState } from "./types";
import type { DayMap, Status } from "./stats";
import { todayFor } from "./dates";

// Lokalt först. Skärmen läser alltid ur `state`, som ligger i localStorage, så
// appen fungerar utan nät. Synken skickar det som ändrats och hämtar det som
// ändrats hos andra enheter. Vid krock vinner den nyaste ändringen, per vana
// och per dag (aldrig per hela historiken).

const KEY = (uid: string) => `dagraknare:v1:${uid}`;
const PAGE = 1000; // Supabase kapar tyst alla svar vid 1 000 rader
const CHUNK = 500;

let state: LocalState = emptyState();
let userId: string | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

function persist() {
  if (!userId) return;
  try { localStorage.setItem(KEY(userId), JSON.stringify(state)); } catch { /* fullt eller blockerat */ }
}

function commit(next: LocalState) {
  state = next;
  persist();
  emit();
  scheduleSync();
}

export function useStore(): LocalState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}

export function initStore(uid: string) {
  userId = uid;
  let loaded = emptyState();
  try {
    const raw = localStorage.getItem(KEY(uid));
    if (raw) loaded = { ...emptyState(), ...JSON.parse(raw) };
  } catch { /* trasig cache: börja om, servern fyller på */ }
  state = loaded;
  emit();
  void sync();
}

export function resetStore() {
  userId = null;
  state = emptyState();
  emit();
}

// ── Läsning ─────────────────────────────────────────────────────────────

export function activeHabits(s: LocalState): Habit[] {
  return Object.values(s.habits).filter((h) => !h.archived).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function archivedHabits(s: LocalState): Habit[] {
  return Object.values(s.habits).filter((h) => h.archived).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function toDayMap(recs: Record<string, DayRec> | undefined): DayMap {
  const out: DayMap = {};
  if (recs) for (const [d, r] of Object.entries(recs)) out[d] = r.s;
  return out;
}

// ── Ändringar ───────────────────────────────────────────────────────────

const now = () => new Date().toISOString();
const addDirty = (list: string[], key: string) => (list.includes(key) ? list : [...list, key]);

export type HabitInput = Pick<Habit, "name" | "startDate" | "goal" | "goalMode" | "color" | "rolloverHour">;

export function addHabit(input: HabitInput): string {
  const id = crypto.randomUUID();
  const t = now();
  const habit: Habit = { ...input, id, archived: false, createdAt: t, updatedAt: t };
  commit({ ...state, habits: { ...state.habits, [id]: habit }, dirtyHabits: addDirty(state.dirtyHabits, id) });
  return id;
}

export function updateHabit(id: string, patch: Partial<HabitInput> & { archived?: boolean }) {
  const cur = state.habits[id];
  if (!cur) return;
  const habit = { ...cur, ...patch, updatedAt: now() };
  commit({ ...state, habits: { ...state.habits, [id]: habit }, dirtyHabits: addDirty(state.dirtyHabits, id) });
}

export function setDay(habitId: string, day: string, status: Status) {
  const rec: DayRec = { s: status, u: now() };
  commit({
    ...state,
    days: { ...state.days, [habitId]: { ...state.days[habitId], [day]: rec } },
    dirtyDays: addDirty(state.dirtyDays, `${habitId}|${day}`),
  });
}

/** Dagens datum för en vana, med dess dygnsgräns. */
export function todayOf(h: Habit): string {
  return todayFor(h.rolloverHour);
}

// ── Synk ────────────────────────────────────────────────────────────────

export interface SyncInfo { status: "idle" | "syncing" | "ok" | "offline" | "error"; message?: string; at?: number }
let syncInfo: SyncInfo = { status: "idle" };
const syncListeners = new Set<() => void>();
function setSync(next: SyncInfo) { syncInfo = next; syncListeners.forEach((l) => l()); }

export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(
    (cb) => { syncListeners.add(cb); return () => { syncListeners.delete(cb); }; },
    () => syncInfo,
  );
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSync(delay = 700) {
  clearTimeout(timer);
  timer = setTimeout(() => { void sync(); }, delay);
}

let running = false;
let again = false;

export async function sync() {
  if (!supabase || !userId) return;
  if (running) { again = true; return; }
  running = true;
  setSync({ status: "syncing", at: syncInfo.at });
  try {
    await push();
    await pull();
    setSync({ status: "ok", at: Date.now() });
  } catch (e) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    setSync({ status: offline ? "offline" : "error", message: e instanceof Error ? e.message : String(e), at: syncInfo.at });
  } finally {
    running = false;
    if (again) { again = false; scheduleSync(300); }
  }
}

function habitRow(h: Habit) {
  return {
    id: h.id, name: h.name, start_date: h.startDate, goal: h.goal, goal_mode: h.goalMode, color: h.color,
    rollover_hour: h.rolloverHour, archived: h.archived, created_at: h.createdAt, updated_at: h.updatedAt,
  };
}

async function push() {
  const db = supabase!;
  const sentHabits: Record<string, string> = {};
  const habitRows = state.dirtyHabits.flatMap((id) => {
    const h = state.habits[id];
    if (!h) return [];
    sentHabits[id] = h.updatedAt;
    return [habitRow(h)];
  });
  // Vanor först: en dagpost kräver att vanan redan finns på servern.
  if (habitRows.length) {
    const { error } = await db.rpc("upsert_habits", { rows: habitRows });
    if (error) throw new Error(error.message);
  }

  const sentDays: Record<string, string> = {};
  const dayRows = state.dirtyDays.flatMap((key) => {
    const [habitId, day] = key.split("|");
    const rec = state.days[habitId]?.[day];
    if (!rec) return [];
    sentDays[key] = rec.u;
    return [{ habit_id: habitId, day, status: rec.s, updated_at: rec.u }];
  });
  for (let i = 0; i < dayRows.length; i += CHUNK) {
    const { error } = await db.rpc("upsert_habit_days", { rows: dayRows.slice(i, i + CHUNK) });
    if (error) throw new Error(error.message);
  }

  // Rensa bara det som inte hunnit ändras igen medan anropet pågick.
  state = {
    ...state,
    dirtyHabits: state.dirtyHabits.filter((id) => !(id in sentHabits) || state.habits[id]?.updatedAt !== sentHabits[id]),
    dirtyDays: state.dirtyDays.filter((k) => {
      if (!(k in sentDays)) return true;
      const [habitId, day] = k.split("|");
      return state.days[habitId]?.[day]?.u !== sentDays[k];
    }),
  };
  persist();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function fetchPages(table: "habits" | "habit_days", cursor: string | null, order: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase!.from(table).select("*");
    // gte, inte gt: rader med samma tidsstämpel som sist ska inte kunna falla bort.
    // De hämtas om och slås ihop utan skada.
    if (cursor) q = q.gte("server_ts", cursor);
    q = q.order("server_ts", { ascending: true });
    for (const col of order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const ts = (s: string) => Date.parse(s);
const maxTs = (rows: Row[], prev: string | null) =>
  rows.reduce<string | null>((m, r) => (m === null || ts(r.server_ts) > ts(m) ? r.server_ts : m), prev);

async function pull() {
  const [habitRows, dayRows] = await Promise.all([
    fetchPages("habits", state.pulledHabits, ["id"]),
    fetchPages("habit_days", state.pulledDays, ["habit_id", "day"]),
  ]);

  // Slås ihop mot `state` som den är NU, inte som den var när hämtningen började.
  const habits = { ...state.habits };
  for (const r of habitRows) {
    const local = habits[r.id];
    if (local && state.dirtyHabits.includes(r.id) && ts(local.updatedAt) >= ts(r.updated_at)) continue;
    if (local && ts(local.updatedAt) > ts(r.updated_at)) continue;
    habits[r.id] = {
      id: r.id, name: r.name, startDate: r.start_date, goal: r.goal, goalMode: r.goal_mode, color: r.color,
      rolloverHour: r.rollover_hour, archived: r.archived, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  const days = { ...state.days };
  const touched = new Set<string>();
  for (const r of dayRows) {
    const local = days[r.habit_id]?.[r.day];
    if (local && ts(local.u) > ts(r.updated_at)) continue;
    if (!touched.has(r.habit_id)) { days[r.habit_id] = { ...days[r.habit_id] }; touched.add(r.habit_id); }
    days[r.habit_id][r.day] = { s: r.status, u: r.updated_at };
  }

  state = {
    ...state,
    habits,
    days,
    pulledHabits: maxTs(habitRows, state.pulledHabits),
    pulledDays: maxTs(dayRows, state.pulledDays),
  };
  persist();
  emit();
}
