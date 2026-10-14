import { useMemo } from "react";
import { addDays } from "../lib/dates";
import { useToday, useOnline } from "../lib/hooks";
import { computeStats, daysLeft, goalProgress, goalUnit, type DayMap } from "../lib/stats";
import { toDayMap, useStore, useSyncInfo } from "../lib/store";
import type { Habit } from "../lib/types";

export function Icon({ name }: { name: "back" | "plus" | "gear" | "edit" }) {
  const d = {
    back: "M15 5l-7 7 7 7",
    plus: "M12 5v14M5 12h14",
    gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.9 7.9 0 000-2l2-1.5-2-3.4-2.3 1a7.7 7.7 0 00-1.7-1L15 3.5h-4L10.6 6a7.7 7.7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7.9 7.9 0 000 2l-2 1.5 2 3.4 2.3-1a7.7 7.7 0 001.7 1L11 20.5h4l.4-2.5a7.7 7.7 0 001.7-1l2.3 1 2-3.4z",
    edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  }[name];
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
}

/** Allt en vana behöver visa, räknat ur dagposterna. */
export function useHabitStats(habit: Habit) {
  const store = useStore();
  const today = useToday(habit.rolloverHour);
  const recs = store.days[habit.id];
  const days: DayMap = useMemo(() => toDayMap(recs), [recs]);
  const stats = useMemo(() => computeStats(days, habit.startDate, today), [days, habit.startDate, today]);
  const progress = goalProgress(stats, habit.goalMode);
  return {
    today, days, stats, progress,
    left: daysLeft(progress, habit.goal),
    pct: Math.min(100, (progress / habit.goal) * 100),
    unit: goalUnit(habit.goalMode),
  };
}

export function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Strip({ days, today, count = 14 }: { days: DayMap; today: string; count?: number }) {
  const cells = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    cells.push(<i key={d} className={`${days[d] === "done" || days[d] === "miss" ? days[d] : ""}${d === today ? " today" : ""}`} title={d} />);
  }
  return <div className="strip" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }} aria-hidden="true">{cells}</div>;
}

export function SyncBadge() {
  const info = useSyncInfo();
  const online = useOnline();
  let text = "Synkad", cls = "";
  if (!online || info.status === "offline") { text = "Offline, sparas lokalt"; cls = "warn"; }
  else if (info.status === "syncing") { text = "Synkar …"; cls = "busy"; }
  else if (info.status === "error") { text = "Synk misslyckades"; cls = "warn"; }
  else if (info.status === "idle") { text = "Ej synkad än"; cls = "busy"; }
  return <span className={`sync ${cls}`} title={info.message}><i />{text}</span>;
}
