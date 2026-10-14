import { useState, type FormEvent } from "react";
import { addHabit, updateHabit, useStore } from "../lib/store";
import { go } from "../lib/hooks";
import { todayFor } from "../lib/dates";
import { HABIT_COLORS } from "../lib/types";
import type { GoalMode } from "../lib/stats";
import { Icon } from "./parts";

const ROLLOVER = [
  [0, "Midnatt (standard)"], [1, "01:00"], [2, "02:00"], [3, "03:00"], [4, "04:00"], [5, "05:00"], [6, "06:00"],
] as const;

export default function HabitForm({ id }: { id?: string }) {
  const existing = useStore().habits[id ?? ""];
  const editing = Boolean(id && existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayFor(0));
  const [goal, setGoal] = useState(String(existing?.goal ?? 100));
  const [goalMode, setGoalMode] = useState<GoalMode>(existing?.goalMode ?? "streak");
  const [color, setColor] = useState(existing?.color ?? HABIT_COLORS[0]);
  const [rolloverHour, setRolloverHour] = useState(existing?.rolloverHour ?? 0);
  const [error, setError] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const g = Number(goal);
    if (!name.trim()) return setError("Ge vanan ett namn.");
    if (!Number.isInteger(g) || g < 1 || g > 10000) return setError("Målet ska vara ett heltal mellan 1 och 10 000 dagar.");
    if (!startDate) return setError("Välj ett startdatum.");
    if (startDate > todayFor(rolloverHour)) return setError("Startdatumet kan inte ligga i framtiden.");
    const input = { name: name.trim().slice(0, 60), startDate, goal: g, goalMode, color, rolloverHour };
    if (editing && id) { updateHabit(id, input); go(`/h/${id}`); }
    else go(`/h/${addHabit(input)}`);
  }

  function archive() {
    if (!id || !existing) return;
    if (window.confirm(`Arkivera "${existing.name}"? Den försvinner från listan och widgeten, men historiken sparas och du kan återställa den.`)) {
      updateHabit(id, { archived: true });
      go("/");
    }
  }

  const back = editing && id ? `#/h/${id}` : "#/";

  return (
    <main className="shell">
      <div className="topbar">
        <a className="iconbtn" href={back} aria-label="Tillbaka"><Icon name="back" /></a>
        <h1>{editing ? "Redigera vana" : "Ny vana"}</h1>
      </div>
      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Namn</label>
          <input id="name" type="text" maxLength={60} placeholder="t.ex. Alkoholfri" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!editing} />
        </div>
        <div className="field">
          <label htmlFor="start">Startdatum</label>
          <input id="start" type="date" max={todayFor(rolloverHour)} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="hint">Dagar före startdatumet räknas inte. Du kan börja i förrgår och fylla i bakåt.</span>
        </div>
        <div className="field">
          <label htmlFor="goal">Mål (antal dagar)</label>
          <input id="goal" type="number" inputMode="numeric" min={1} max={10000} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl" id="mode-lbl">Målet räknas som</span>
          <div className="seg" role="group" aria-labelledby="mode-lbl">
            <button type="button" aria-pressed={goalMode === "streak"} onClick={() => setGoalMode("streak")}>Dagar i rad</button>
            <button type="button" aria-pressed={goalMode === "total"} onClick={() => setGoalMode("total")}>Totalt antal</button>
          </div>
          <span className="hint">
            {goalMode === "streak"
              ? "Ett avbrott nollar räknaren. Längsta streak och totalt antal sparas ändå."
              : "Räknaren tål avbrott och visar hur många dagar du klarat sammanlagt."}
          </span>
        </div>
        <div className="field">
          <span className="lbl" id="color-lbl">Färg</span>
          <div className="swatches" role="group" aria-labelledby="color-lbl">
            {HABIT_COLORS.map((c) => (
              <button key={c} type="button" style={{ background: c }} aria-label={`Färg ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="rollover">Dygnet byter klockan</label>
          <select id="rollover" value={rolloverHour} onChange={(e) => setRolloverHour(Number(e.target.value))}>
            {ROLLOVER.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
          </select>
          <span className="hint">Loggar du ofta efter midnatt? Välj 03:00 så räknas tiden fram till dess som gårdagen. Widgeten följer samma inställning.</span>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block">{editing ? "Spara" : "Skapa vana"}</button>
      </form>
      {editing && <button className="btn danger block" onClick={archive}>Arkivera vanan</button>}
    </main>
  );
}
