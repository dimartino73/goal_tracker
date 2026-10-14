import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { computeStats, describeChange, type DayMap } from "./stats";
import { addDays, todayFor } from "./dates";

const TODAY = "2026-10-14";
const START = "2026-09-01";

// Samma exempeldata som i mockupen: allt klarat, 18 sep missad, 25 sep glömd, idag ej angiven.
function sample(): DayMap {
  const m: DayMap = {};
  for (let d = START; d <= addDays(TODAY, -1); d = addDays(d, 1)) m[d] = "done";
  m["2026-09-18"] = "miss";
  delete m["2026-09-25"];
  return m;
}

describe("computeStats", () => {
  it("räknar streak, längsta och totalt på exempeldatan", () => {
    const s = computeStats(sample(), START, TODAY);
    expect(s.current).toBe(18); // 26 sep – 13 okt
    expect(s.longest).toBe(18);
    expect(s.total).toBe(41); // 43 dagar före idag minus 18 sep och 25 sep
    expect(s.breaks.map((b) => [b.brokenOn, b.len])).toEqual([["2026-09-18", 17], ["2026-09-25", 6]]);
  });

  it("slår ihop två perioder när en glömd dag rättas bakåt", () => {
    const m = sample();
    m["2026-09-25"] = "done";
    const s = computeStats(m, START, TODAY);
    expect(s.current).toBe(25); // 19 sep – 13 okt
    expect(describeChange(18, s.current, "streak")).toBe("Dagar i rad: 18 → 25 (två perioder slogs ihop)");
  });

  it("bryter inte streaken på en oregistrerad idag", () => {
    expect(computeStats(sample(), START, TODAY).current).toBe(18);
  });

  it("räknar idag när den är klarad", () => {
    const m = sample();
    m[TODAY] = "done";
    const s = computeStats(m, START, TODAY);
    expect(s.current).toBe(19);
    expect(s.total).toBe(42);
  });

  it("nollar streaken när idag uttryckligen är missad", () => {
    const m = sample();
    m[TODAY] = "miss";
    const s = computeStats(m, START, TODAY);
    expect(s.current).toBe(0);
    expect(s.breaks.at(-1)).toEqual({ len: 18, brokenOn: TODAY });
  });

  it("behandlar 'none' som ej angiven", () => {
    const m = sample();
    m["2026-09-25"] = "none";
    expect(computeStats(m, START, TODAY).current).toBe(18);
  });

  it("klarar att vanan startar idag", () => {
    expect(computeStats({}, TODAY, TODAY)).toMatchObject({ current: 0, longest: 0, total: 0 });
    expect(computeStats({ [TODAY]: "done" }, TODAY, TODAY).current).toBe(1);
  });

  it("räknar en dag per kalenderdag över månads- och årsskifte", () => {
    const m: DayMap = {};
    for (let d = "2026-12-28"; d <= "2027-01-03"; d = addDays(d, 1)) m[d] = "done";
    expect(computeStats(m, "2026-12-28", "2027-01-03").current).toBe(7);
  });

  it("månadssiffrorna räknar inte en ännu oregistrerad idag som missad", () => {
    expect(computeStats(sample(), START, TODAY).months["2026-10"]).toEqual({ done: 13, days: 13 });
    expect(computeStats(sample(), START, TODAY).months["2026-09"]).toEqual({ done: 28, days: 30 });
  });
});

describe("todayFor", () => {
  it("flyttar dygnsgränsen med rolloverHour", () => {
    const natt = new Date(2026, 9, 14, 1, 30); // 14 okt 01:30 lokal tid
    expect(todayFor(0, natt)).toBe("2026-10-14");
    expect(todayFor(3, natt)).toBe("2026-10-13");
    expect(todayFor(3, new Date(2026, 9, 14, 3, 0))).toBe("2026-10-14");
  });
});

// Widgeten är en egen fil som Scriptable läser, och kan inte importera appens kod.
// Slumpa data och kräv att de två räknar likadant, så att de inte glider isär.
describe("widget-kopian räknar som appen", () => {
  const widget = createRequire(import.meta.url)("../../widget/dagraknare-widget.cjs");

  it("ger samma streak, längsta och totalt på 200 slumpade historier", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 200; i++) {
      const start = addDays(TODAY, -Math.floor(rnd() * 120));
      const days: DayMap = {};
      const entry = { done: [] as string[], miss: [] as string[] };
      for (let d = start; d <= TODAY; d = addDays(d, 1)) {
        const r = rnd();
        if (r < 0.7) { days[d] = "done"; entry.done.push(d); }
        else if (r < 0.8) { days[d] = "miss"; entry.miss.push(d); }
      }
      const app = computeStats(days, start, TODAY);
      const w = widget.computeStats(widget.toDayMap(entry), start, TODAY);
      expect(w).toEqual({ current: app.current, longest: app.longest, total: app.total });
    }
  });

  it("filtrerar vanor på namn via widgetparametern", () => {
    const data = { habits: [{ name: "Alkoholfri" }, { name: "Löpning" }] };
    expect(widget.pickHabits(data, "")).toHaveLength(2);
    expect(widget.pickHabits(data, "löp")).toEqual([{ name: "Löpning" }]);
    expect(widget.pickHabits(data, "xyz")).toEqual([]);
  });
});
