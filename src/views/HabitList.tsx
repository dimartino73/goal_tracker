import { useState } from "react";
import { activeHabits, archivedHabits, setDay, updateHabit, useStore } from "../lib/store";
import { go } from "../lib/hooks";
import type { Habit } from "../lib/types";
import { Bar, Icon, Strip, SyncBadge, useHabitStats } from "./parts";

function HabitCard({ habit }: { habit: Habit }) {
  const { today, days, stats, progress, left, pct, unit } = useHabitStats(habit);
  const done = days[today] === "done";
  return (
    <article className="card habit">
      <a href={`#/h/${habit.id}`} className="habit" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="row1">
          <span className="name">{habit.name}</span>
          <span className="sub">mål {habit.goal}</span>
        </div>
        <div>
          <div className="big num" style={{ color: habit.color }}>{progress}</div>
          <div className="unit">{unit}</div>
        </div>
        <Bar pct={pct} color={habit.color} />
        <div className="sub"><b style={{ color: "var(--ink)" }}>{left === 0 ? "Målet nått" : `${left} dagar kvar`}</b> · totalt {stats.total} klarade</div>
        <Strip days={days} today={today} />
      </a>
      <button
        type="button"
        className={`btn block ${done ? "on" : ""}`}
        aria-pressed={done}
        onClick={() => setDay(habit.id, today, done ? "none" : "done")}
      >
        {done ? "✓ Klart idag (tryck för att ångra)" : "Klarade idag"}
      </button>
    </article>
  );
}

export default function HabitList() {
  const store = useStore();
  const habits = activeHabits(store);
  const archived = archivedHabits(store);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <main className="shell">
      <div className="topbar">
        <h1>Dagräknare</h1>
        <a className="iconbtn" href="#/ny" aria-label="Ny vana"><Icon name="plus" /></a>
        <a className="iconbtn" href="#/installningar" aria-label="Inställningar"><Icon name="gear" /></a>
      </div>
      <div><SyncBadge /></div>

      {habits.length === 0 ? (
        <div className="card empty">
          <h2>Inga vanor ännu</h2>
          <p className="sub" style={{ margin: 0, maxWidth: "32ch" }}>Skapa en vana, välj ett mål och börja räkna. Du kan fylla i tidigare dagar i efterhand.</p>
          <button className="btn" onClick={() => go("/ny")}>Skapa din första vana</button>
        </div>
      ) : (
        habits.map((h) => <HabitCard key={h.id} habit={h} />)
      )}

      {archived.length > 0 && (
        <section className="stack">
          <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Dölj" : "Visa"} arkiverade ({archived.length})
          </button>
          {showArchived && archived.map((h) => (
            <div className="card" key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>{h.name}</span>
              <button className="btn ghost" onClick={() => updateHabit(h.id, { archived: false })}>Återställ</button>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
