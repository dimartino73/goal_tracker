// Dagräknare — widget för Scriptable (iOS)
//
// Klistra in hela filen i ett nytt skript i Scriptable (eller använd knappen
// "Kopiera widget-skript" i appen under Inställningar, som fyller i de fyra
// värdena här nedan åt dig). Lägg sedan till en Scriptable-widget på
// hemskärmen, välj skriptet och skriv eventuellt en vanas namn som Parameter.
//
//   Parameter tom   Liten/medel: första vanan. Stor: upp till fyra vanor.
//   Parameter text  Visar vanan vars namn innehåller texten (gemener/versaler spelar ingen roll).
//
// Widgeten LÄSER bara. Den kan inte bocka av en dag; det görs i appen.
// Ett tryck på widgeten öppnar appen i Safari.

const CONFIG = {
  supabaseUrl: "__SUPABASE_URL__",
  anonKey: "__SUPABASE_ANON_KEY__",
  token: "__WIDGET_TOKEN__",
  appUrl: "__APP_URL__",
};

// ── Datum och räkning ───────────────────────────────────────────────────
// Samma logik som src/lib/stats.ts i appen. stats.test.ts jämför dem.

const pad = (n) => String(n).padStart(2, "0");
const parseDay = (s) => { const p = s.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
const formatDay = (t) => { const d = new Date(t); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); };
const addDays = (day, n) => formatDay(parseDay(day) + n * 86400000);

function todayFor(rolloverHour, now) {
  const d = new Date((now || new Date()).getTime() - rolloverHour * 3600000);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function toDayMap(entry) {
  const map = {};
  if (entry) {
    (entry.miss || []).forEach((d) => { map[d] = "miss"; });
    (entry.done || []).forEach((d) => { map[d] = "done"; });
  }
  return map;
}

function computeStats(days, startDate, today) {
  let total = 0, longest = 0, run = 0;
  for (let d = startDate; d <= today; d = addDays(d, 1)) {
    const v = days[d];
    const pending = d === today && (v === undefined || v === "none");
    if (v === "done") { total++; run++; if (run > longest) longest = run; }
    else if (!pending) run = 0;
  }
  let current = 0;
  let p;
  if (days[today] === "done") p = today;
  else if (days[today] === "miss") p = null;
  else p = addDays(today, -1);
  while (p && p >= startDate && days[p] === "done") { current++; p = addDays(p, -1); }
  return { current, longest, total };
}

function summarize(habit, entry, now) {
  const today = todayFor(habit.rolloverHour || 0, now);
  const days = toDayMap(entry);
  const s = computeStats(days, habit.startDate, today);
  const progress = habit.goalMode === "total" ? s.total : s.current;
  return {
    habit, today, days, stats: s, progress,
    left: Math.max(0, habit.goal - progress),
    pct: Math.min(1, progress / habit.goal),
    unit: habit.goalMode === "total" ? "dagar totalt" : "dagar i rad",
  };
}

function pickHabits(data, param) {
  const all = data.habits || [];
  const q = (param || "").trim().toLowerCase();
  if (!q) return all;
  return all.filter((h) => h.name.toLowerCase().includes(q));
}

if (typeof ListWidget === "undefined") {
  // Körs i Node (tester): exportera bara de rena funktionerna.
  module.exports = { computeStats, summarize, toDayMap, pickHabits, todayFor };
} else {
  // Inget top-level await: filen ska gå att läsa in som CommonJS i testerna.
  main().catch((e) => { console.error(e); Script.complete(); });
}

// ── Hämtning ────────────────────────────────────────────────────────────

async function load() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), "dagraknare-cache.json");
  try {
    const req = new Request(CONFIG.supabaseUrl + "/rest/v1/rpc/habit_widget");
    req.method = "POST";
    req.timeoutInterval = 15;
    req.headers = { apikey: CONFIG.anonKey, "Content-Type": "application/json" };
    // Äldre anon-nycklar är JWT och ska också skickas som Bearer; nya (sb_publishable_…) ska det inte.
    if (CONFIG.anonKey.indexOf("eyJ") === 0) req.headers.Authorization = "Bearer " + CONFIG.anonKey;
    req.body = JSON.stringify({ p_token: CONFIG.token });
    const data = await req.loadJSON();
    if (!data || !data.habits) throw new Error(data && data.message ? data.message : "Nyckeln gäller inte längre. Skapa ny i appen.");
    fm.writeString(path, JSON.stringify(data));
    return { data: data, stale: false };
  } catch (e) {
    if (fm.fileExists(path)) return { data: JSON.parse(fm.readString(path)), stale: true };
    throw e;
  }
}

// ── Ritning ─────────────────────────────────────────────────────────────

function theme() {
  const dark = Device.isUsingDarkAppearance();
  return dark
    ? { bg: new Color("#18231f"), ink: new Color("#e8f1ed"), muted: new Color("#92a69d"), track: new Color("#2a3a34"), miss: new Color("#ef7b70"), empty: new Color("#3a4b44") }
    : { bg: new Color("#ffffff"), ink: new Color("#12201b"), muted: new Color("#586a63"), track: new Color("#e3ebe7"), miss: new Color("#bf4a40"), empty: new Color("#c3cfc9") };
}

function barImage(width, height, pct, fg, track) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const r = height / 2;
  const base = new Path();
  base.addRoundedRect(new Rect(0, 0, width, height), r, r);
  dc.addPath(base);
  dc.setFillColor(track);
  dc.fillPath();
  const w = Math.max(pct > 0 ? height : 0, width * pct);
  if (w > 0) {
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, w, height), r, r);
    dc.addPath(fill);
    dc.setFillColor(fg);
    dc.fillPath();
  }
  return dc.getImage();
}

function stripImage(width, height, sum, count, t) {
  const gap = 3;
  const size = Math.min(height, (width - gap * (count - 1)) / count);
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  for (let i = 0; i < count; i++) {
    const day = addDays(sum.today, -(count - 1 - i));
    const v = sum.days[day];
    const color = v === "done" ? new Color(sum.habit.color) : v === "miss" ? t.miss : t.empty;
    const x = i * (size + gap);
    const p = new Path();
    p.addRoundedRect(new Rect(x, 0, size, size), 3, 3);
    dc.addPath(p);
    dc.setFillColor(color);
    dc.fillPath();
  }
  return dc.getImage();
}

function leftText(sum) {
  return sum.left === 0 ? "Målet nått" : sum.left + " kvar till " + sum.habit.goal;
}

function addText(parent, text, font, color, opts) {
  const t = parent.addText(text);
  t.font = font;
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = (opts && opts.scale) || 0.7;
  return t;
}

function buildSmall(w, sum, t, stale) {
  addText(w, sum.habit.name.toUpperCase(), Font.semiboldSystemFont(11), t.muted);
  w.addSpacer(4);
  addText(w, String(sum.progress), Font.heavySystemFont(52), t.ink, { scale: 0.5 });
  addText(w, sum.unit + (stale ? " · offline" : ""), Font.mediumSystemFont(12), t.muted);
  w.addSpacer();
  const bar = w.addImage(barImage(200, 9, sum.pct, new Color(sum.habit.color), t.track));
  bar.imageSize = new Size(130, 7);
  w.addSpacer(5);
  addText(w, leftText(sum), Font.semiboldSystemFont(11), t.ink);
}

function buildMedium(w, sum, t, stale) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const left = row.addStack();
  left.layoutVertically();
  addText(left, sum.habit.name.toUpperCase(), Font.semiboldSystemFont(11), t.muted);
  left.addSpacer(2);
  addText(left, String(sum.progress), Font.heavySystemFont(56), t.ink, { scale: 0.5 });
  addText(left, sum.unit + (stale ? " · offline" : ""), Font.mediumSystemFont(12), t.muted);

  row.addSpacer(18);

  const right = row.addStack();
  right.layoutVertically();
  right.addSpacer();
  const bar = right.addImage(barImage(400, 10, sum.pct, new Color(sum.habit.color), t.track));
  bar.imageSize = new Size(170, 8);
  right.addSpacer(5);
  addText(right, sum.progress + " / " + sum.habit.goal + "  ·  " + (sum.left === 0 ? "målet nått" : sum.left + " kvar"), Font.semiboldSystemFont(12), t.ink);
  right.addSpacer(10);
  const strip = right.addImage(stripImage(340, 12, sum, 14, t));
  strip.imageSize = new Size(170, 12);
  right.addSpacer(5);
  addText(right, "Totalt " + sum.stats.total + " · längsta " + sum.stats.longest, Font.mediumSystemFont(11), t.muted);
  right.addSpacer();
}

function buildLarge(w, sums, t, stale) {
  sums.slice(0, 4).forEach((sum, i) => {
    if (i > 0) w.addSpacer(12);
    const head = w.addStack();
    head.layoutHorizontally();
    head.bottomAlignContent();
    addText(head, sum.habit.name, Font.semiboldSystemFont(14), t.ink);
    head.addSpacer();
    addText(head, sum.progress + " " + sum.unit, Font.heavySystemFont(14), new Color(sum.habit.color));
    w.addSpacer(5);
    const bar = w.addImage(barImage(600, 10, sum.pct, new Color(sum.habit.color), t.track));
    bar.imageSize = new Size(300, 8);
    w.addSpacer(5);
    const strip = w.addImage(stripImage(600, 14, sum, 21, t));
    strip.imageSize = new Size(300, 12);
    w.addSpacer(3);
    addText(w, leftText(sum) + "  ·  totalt " + sum.stats.total, Font.mediumSystemFont(11), t.muted);
  });
  w.addSpacer();
  if (stale) addText(w, "Offline: visar senast hämtade data", Font.mediumSystemFont(10), t.muted);
}

function buildLock(w, sum, family) {
  if (family === "accessoryCircular") {
    const s = w.addStack();
    s.layoutVertically();
    s.centerAlignContent();
    const n = s.addText(String(sum.progress));
    n.font = Font.heavySystemFont(22);
    n.centerAlignText();
    const u = s.addText("dagar");
    u.font = Font.mediumSystemFont(9);
    u.centerAlignText();
    return;
  }
  const h = w.addText(sum.habit.name);
  h.font = Font.semiboldSystemFont(12);
  h.lineLimit = 1;
  const n = w.addText(sum.progress + " " + sum.unit);
  n.font = Font.heavySystemFont(15);
  n.lineLimit = 1;
  const l = w.addText(leftText(sum));
  l.font = Font.mediumSystemFont(11);
  l.lineLimit = 1;
}

function errorWidget(message) {
  const t = theme();
  const w = new ListWidget();
  w.backgroundColor = t.bg;
  addText(w, "Dagräknare", Font.semiboldSystemFont(13), t.ink);
  w.addSpacer(4);
  const m = w.addText(message);
  m.font = Font.systemFont(11);
  m.textColor = t.muted;
  return w;
}

async function main() {
  const family = config.widgetFamily || "medium";
  const lock = family === "accessoryCircular" || family === "accessoryRectangular" || family === "accessoryInline";
  let w;
  try {
    const res = await load();
    const habits = pickHabits(res.data, args.widgetParameter);
    if (!habits.length) {
      w = errorWidget(args.widgetParameter ? "Ingen vana matchar \"" + args.widgetParameter + "\"." : "Du har inga vanor ännu. Skapa en i appen.");
    } else {
      const now = new Date();
      const t = theme();
      const sums = habits.map((h) => summarize(h, (res.data.days || {})[h.id], now));
      w = new ListWidget();
      w.url = CONFIG.appUrl + "#/h/" + sums[0].habit.id;
      if (lock) {
        if (family === "accessoryInline") w.addText(sums[0].habit.name + " " + sums[0].progress);
        else buildLock(w, sums[0], family);
      } else {
        w.backgroundColor = t.bg;
        w.setPadding(14, 14, 14, 14);
        if (family === "small") buildSmall(w, sums[0], t, res.stale);
        else if (family === "large" || family === "extraLarge") buildLarge(w, sums, t, res.stale);
        else buildMedium(w, sums[0], t, res.stale);
      }
    }
  } catch (e) {
    w = errorWidget(String(e && e.message ? e.message : e));
  }
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (config.runsInWidget) Script.setWidget(w);
  else if (family === "small") await w.presentSmall();
  else if (family === "large") await w.presentLarge();
  else await w.presentMedium();
  Script.complete();
}
