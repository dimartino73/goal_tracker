import { useState } from "react";
import { addDays, daysInMonth, leadingBlanks, monthKey, monthLabel, shiftMonth, shortLabel, WEEKDAYS_SHORT } from "../lib/dates";
import { computeStats, describeChange, goalProgress, type DayMap, type Status } from "../lib/stats";
import { setDay, useStore } from "../lib/store";
import type { Habit } from "../lib/types";
import { Bar, Icon, Strip, SyncBadge, useHabitStats } from "./parts";

type Tab = "idag" | "kalender" | "statistik";

export default function HabitView({ id, tab }: { id: string; tab: Tab }) {
  const habit = useStore().habits[id];
  if (!habit) {
    return (
      <main className="shell">
        <div className="topbar"><a className="iconbtn" href="#/" aria-label="Tillbaka"><Icon name="back" /></a><h1>Vanan finns inte</h1></div>
        <p className="sub">Den kan ha tagits bort på en annan enhet, eller så har den inte hunnit synkas hit än.</p>
      </main>
    );
  }
  return <HabitScreen habit={habit} tab={tab} />;
}

function HabitScreen({ habit, tab }: { habit: Habit; tab: Tab }) {
  const view = useHabitStats(habit);
  return (
    <main className="shell">
      <div className="topbar">
        <a className="iconbtn" href="#/" aria-label="Tillbaka"><Icon name="back" /></a>
        <h1>{habit.name}</h1>
        <a className="iconbtn" href={`#/h/${habit.id}/redigera`} aria-label="Redigera vanan"><Icon name="edit" /></a>
      </div>
      <nav className="tabs" aria-label="Vyer">
        {([["idag", "Idag"], ["kalender", "Kalender"], ["statistik", "Statistik"]] as const).map(([t, label]) => (
          <a key={t} href={`#/h/${habit.id}${t === "idag" ? "" : "/" + t}`} aria-current={tab === t ? "page" : undefined}>{label}</a>
        ))}
      </nav>
      {tab === "idag" && <Today habit={habit} view={view} />}
      {tab === "kalender" && <Calendar habit={habit} view={view} />}
      {tab === "statistik" && <StatsTab habit={habit} view={view} />}
      <div><SyncBadge /></div>
    </main>
  );
}

type View = ReturnType<typeof useHabitStats>;

function etaText(view: View): string {
  if (view.left === 0) return "Målet är nått";
  const eta = addDays(view.today, view.left);
  return `Beräknat mål: ${shortLabel(eta, Number(view.today.slice(0, 4)))}`;
}

function Today({ habit, view }: { habit: Habit; view: View }) {
  const done = view.days[view.today] === "done";
  return (
    <>
      <div className="card hero">
        <div>
          <div className="big num" style={{ color: habit.color }}>{view.progress}</div>
          <div className="sub" style={{ fontSize: 15 }}>{view.unit}</div>
        </div>
        <Bar pct={view.pct} color={habit.color} />
        <div className="sub"><b style={{ color: "var(--ink)" }}>{view.left === 0 ? "Målet nått" : `${view.left} dagar kvar`}</b> till {habit.goal} · {etaText(view)}</div>
      </div>
      <button className={`btn block ${done ? "on" : ""}`} style={{ minHeight: 56, fontSize: 17 }} aria-pressed={done}
        onClick={() => setDay(habit.id, view.today, done ? "none" : "done")}>
        {done ? "✓ Klart idag (tryck för att ångra)" : "Klarade idag"}
      </button>
      <div className="meta">
        <div><b>{view.stats.current}</b><span>i rad nu</span></div>
        <div><b>{view.stats.longest}</b><span>längsta</span></div>
        <div><b>{view.stats.total}</b><span>totalt klarat</span></div>
      </div>
      <div className="card">
        <p className="h3">Senaste 14 dagarna</p>
        <Strip days={view.days} today={view.today} />
        <p className="sub" style={{ margin: "10px 0 0" }}>Glömde du en dag? Öppna Kalender och rätta den.</p>
      </div>
    </>
  );
}

function Calendar({ habit, view }: { habit: Habit; view: View }) {
  const [month, setMonth] = useState(monthKey(view.today));
  const [sel, setSel] = useState<string | null>(null);
  const [effect, setEffect] = useState("");
  const first = monthKey(habit.startDate), last = monthKey(view.today);

  function choose(day: string, status: Status) {
    // Räkna före och efter på samma dagar, så ändringen kan förklaras för användaren.
    const before: DayMap = { ...view.days };
    const after: DayMap = { ...view.days, [day]: status };
    const b = goalProgress(computeStats(before, habit.startDate, view.today), habit.goalMode);
    const a = goalProgress(computeStats(after, habit.startDate, view.today), habit.goalMode);
    setEffect(describeChange(b, a, habit.goalMode));
    setDay(habit.id, day, status);
  }

  const cells = [];
  for (let i = 0; i < leadingBlanks(month); i++) cells.push(<div key={`b${i}`} />);
  for (let n = 1; n <= daysInMonth(month); n++) {
    const day = `${month}-${String(n).padStart(2, "0")}`;
    const off = day < habit.startDate || day > view.today;
    const v = view.days[day];
    const label = `${shortLabel(day)}: ${v === "done" ? "klarad" : v === "miss" ? "missad" : "ej angiven"}`;
    cells.push(
      <button key={day} type="button" disabled={off} aria-label={label}
        className={`day ${off ? "off" : v === "done" || v === "miss" ? v : ""}${day === sel ? " sel" : ""}${day === view.today ? " today" : ""}`}
        onClick={() => { setSel(day); setEffect(""); }}>{n}</button>,
    );
  }
  const selV = sel ? view.days[sel] ?? "none" : null;

  return (
    <>
      <div className="card">
        <div className="cal-head">
          <button type="button" aria-label="Föregående månad" disabled={month <= first} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <b>{monthLabel(month)}</b>
          <button type="button" aria-label="Nästa månad" disabled={month >= last} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
        <div className="grid7">
          {WEEKDAYS_SHORT.map((d) => <div className="dow" key={d}>{d}</div>)}
          {cells}
        </div>
        <div className="legend"><span><i className="d" />Klarad</span><span><i className="m" />Missad</span><span><i />Ej angiven</span></div>
      </div>
      {sel ? (
        <div className="card">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>{shortLabel(sel)}{sel === view.today ? " (idag)" : ""}</h3>
          <div className="choices">
            {([["done", "Klarad"], ["miss", "Missad"], ["none", "Ej angiven"]] as const).map(([v, label]) => (
              <button key={v} type="button" data-v={v} aria-pressed={selV === v} onClick={() => choose(sel, v)}>{label}</button>
            ))}
          </div>
          {effect && <p className="notice" style={{ margin: "10px 0 0" }} role="status">{effect}</p>}
        </div>
      ) : (
        <div className="card"><p className="sub" style={{ margin: 0 }}>Tryck på en dag för att ändra den. Siffrorna räknas om direkt.</p></div>
      )}
    </>
  );
}

function StatsTab({ habit, view }: { habit: Habit; view: View }) {
  const months = Object.keys(view.stats.months).sort();
  const breaks = [...view.stats.breaks].reverse();
  return (
    <>
      <div className="meta">
        <div><b>{view.stats.current}</b><span>i rad nu</span></div>
        <div><b>{view.stats.longest}</b><span>längsta</span></div>
        <div><b>{view.stats.total}</b><span>totalt</span></div>
      </div>
      <div className="card">
        <p className="h3">Klarade dagar per månad</p>
        <div className="months">
          {months.map((k) => {
            const m = view.stats.months[k];
            return (
              <div className="mrow" key={k}>
                <span>{monthLabel(k).split(" ")[0].slice(0, 3)}</span>
                <div className="t"><span style={{ width: `${m.days ? (m.done / m.days) * 100 : 0}%`, background: habit.color }} /></div>
                <em>{m.done}/{m.days}</em>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card">
        <p className="h3">Avbrott</p>
        <ul className="breaks">
          {breaks.length === 0 && <li>Inga avbrott</li>}
          {breaks.map((b) => (
            <li key={b.brokenOn}><span>Bröts {shortLabel(b.brokenOn)}</span><b>efter {b.len} {b.len === 1 ? "dag" : "dagar"}</b></li>
          ))}
        </ul>
      </div>
    </>
  );
}
