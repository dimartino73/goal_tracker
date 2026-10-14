// Kör migrationen mot riktig Postgres (PGlite, ingen server behövs) och
// kontrollerar RLS, "nyast vinner"-synken och widgetens nyckelåtkomst.
//
//   npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const db = new PGlite();

await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated nologin;
  create role anon nologin;
`);
// Supabase ger anon och authenticated rättigheter på allt nytt i public som standard.
// Efterlikna det FÖRE migrationen, så att dess revoke-satser prövas på riktigt.
await db.exec(`
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) await db.exec(readFileSync(join(MIG, f), "utf8"));
// Idempotent: samma fil ska gå att köra igen.
for (const f of files) await db.exec(readFileSync(join(MIG, f), "utf8"));

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${n}${!c && extra ? "  — " + extra : ""}`); };
const nekas = async (n, fn) => { try { await fn(); ok(n, false, "gick igenom"); } catch { ok(n, true); } };
const tillåts = async (n, fn) => { try { await fn(); ok(n, true); } catch (e) { ok(n, false, e.message.split("\n")[0]); } };

async function as(uid, sql, params = [], role = "authenticated") {
  await db.exec(`set role ${role}; set test.uid = '${uid ?? ""}';`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role; reset test.uid;`); }
}
const mk = async (e) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [e])).rows[0].id;
const A = await mk("a@x.se"), B = await mk("b@x.se");
const H1 = "11111111-1111-1111-1111-111111111111";
const H2 = "22222222-2222-2222-2222-222222222222";
const T = (s) => `2026-10-14T${s}Z`;

const habit = (id, over = {}) => ({
  id, name: "Alkoholfri", start_date: "2026-09-01", goal: 100, goal_mode: "streak", color: "#1c7c5d",
  rollover_hour: 0, archived: false, created_at: T("08:00:00"), updated_at: T("08:00:00"), ...over,
});
const up = (uid, rows) => as(uid, `select public.upsert_habits($1::jsonb)`, [JSON.stringify(rows)]);
const upd = (uid, rows) => as(uid, `select public.upsert_habit_days($1::jsonb)`, [JSON.stringify(rows)]);

console.log("── Vanor ──");
await tillåts("A skapar en vana", () => up(A, [habit(H1)]));
ok("A ser sin vana", (await as(A, `select 1 from habits`)).rows.length === 1);
ok("B ser ingenting", (await as(B, `select 1 from habits`)).rows.length === 0);
ok("anon ser ingenting", (await as(null, `select 1 from habits`, [], "anon")).rows.length === 0);
ok("user_id sätts av servern, inte av klienten", (await as(A, `select user_id from habits`)).rows[0].user_id === A);
await nekas("B kan inte skriva över A:s vana med samma id", () => up(B, [habit(H1, { name: "Kapad", updated_at: T("09:00:00") })]));
ok("A:s vana är oförändrad", (await as(A, `select name from habits`)).rows[0].name === "Alkoholfri");
await nekas("anon kan inte anropa upsert_habits", () => as(null, `select public.upsert_habits('[]')`, [], "anon"));
await nekas("anon kan inte anropa upsert_habit_days", () => as(null, `select public.upsert_habit_days('[]')`, [], "anon"));
await nekas("mål utanför 1–10000 avvisas", () => up(A, [habit(H2, { goal: 0 })]));
await nekas("ogiltig färg avvisas", () => up(A, [habit(H2, { color: "röd" })]));

console.log("\n── Nyast vinner ──");
await up(A, [habit(H1, { name: "Äldre", updated_at: T("07:00:00") })]);
ok("äldre ändring ignoreras", (await as(A, `select name from habits`)).rows[0].name === "Alkoholfri");
await up(A, [habit(H1, { name: "Nyare", updated_at: T("10:00:00") })]);
ok("nyare ändring vinner", (await as(A, `select name from habits`)).rows[0].name === "Nyare");
const ts1 = (await as(A, `select server_ts from habits`)).rows[0].server_ts;
await new Promise((r) => setTimeout(r, 20));
await up(A, [habit(H1, { name: "Nyast", updated_at: T("11:00:00") })]);
const ts2 = (await as(A, `select server_ts from habits`)).rows[0].server_ts;
ok("server_ts flyttas fram vid ändring (inkrementell hämtning)", ts2 > ts1);

console.log("\n── Dagposter ──");
await tillåts("A sparar tre dagar", () => upd(A, [
  { habit_id: H1, day: "2026-10-12", status: "done", updated_at: T("08:00:00") },
  { habit_id: H1, day: "2026-10-13", status: "done", updated_at: T("08:00:00") },
  { habit_id: H1, day: "2026-10-11", status: "miss", updated_at: T("08:00:00") },
]));
await upd(A, [{ habit_id: H1, day: "2026-10-13", status: "none", updated_at: T("09:00:00") }]);
ok("'none' lagras (så att en rensning når andra enheter)",
  (await as(A, `select status from habit_days where day = '2026-10-13'`)).rows[0].status === "none");
await upd(A, [{ habit_id: H1, day: "2026-10-13", status: "done", updated_at: T("08:30:00") }]);
ok("äldre dagpost skriver inte över nyare",
  (await as(A, `select status from habit_days where day = '2026-10-13'`)).rows[0].status === "none");
await nekas("B kan inte lägga en dag på A:s vana",
  () => upd(B, [{ habit_id: H1, day: "2026-10-10", status: "done", updated_at: T("08:00:00") }]));
await nekas("ogiltig status avvisas",
  () => upd(A, [{ habit_id: H1, day: "2026-10-10", status: "kanske", updated_at: T("08:00:00") }]));
ok("B ser inga dagar", (await as(B, `select 1 from habit_days`)).rows.length === 0);
ok("anon ser inga dagar", (await as(null, `select 1 from habit_days`, [], "anon")).rows.length === 0);

console.log("\n── Widget-nyckel ──");
const tokA = (await as(A, `insert into habit_widget_tokens default values returning token`)).rows[0].token;
await as(B, `insert into habit_widget_tokens default values`);
ok("B kan inte läsa A:s nyckel", !(await as(B, `select token from habit_widget_tokens`)).rows.some((r) => r.token === tokA));
ok("anon kan inte läsa nyckeltabellen", (await as(null, `select 1 from habit_widget_tokens`, [], "anon")).rows.length === 0);

const w = (await as(null, `select public.habit_widget($1) as d`, [tokA], "anon")).rows[0].d;
ok("anon får A:s vanor med rätt nyckel", w?.habits?.length === 1 && w.habits[0].name === "Nyast");
ok("widgetn får fälten den läser", ["id", "name", "startDate", "goal", "goalMode", "color", "rolloverHour"].every((k) => k in w.habits[0]));
ok("klarade dagar kommer som datumlista", JSON.stringify(w.days[H1].done) === '["2026-10-12"]', JSON.stringify(w.days[H1]));
ok("missade dagar kommer som datumlista", JSON.stringify(w.days[H1].miss) === '["2026-10-11"]');
ok("'none' skickas inte till widgeten", !JSON.stringify(w).includes("2026-10-13"));
ok("fel nyckel ger null", (await as(null, `select public.habit_widget('00000000-0000-0000-0000-000000000000') as d`, [], "anon")).rows[0].d === null);
const tokB = (await as(B, `select token from habit_widget_tokens`)).rows[0].token;
const wB = (await as(null, `select public.habit_widget($1) as d`, [tokB], "anon")).rows[0].d;
ok("B:s nyckel ger inga av A:s vanor", wB.habits.length === 0 && Object.keys(wB.days).length === 0);

await up(A, [habit(H1, { archived: true, updated_at: T("12:00:00") })]);
const wArk = (await as(null, `select public.habit_widget($1) as d`, [tokA], "anon")).rows[0].d;
ok("arkiverad vana visas inte i widgeten", wArk.habits.length === 0);

const nyTok = (await as(A, `update habit_widget_tokens set token = gen_random_uuid() returning token`)).rows[0].token;
ok("byte av nyckel gör den gamla ogiltig",
  (await as(null, `select public.habit_widget($1) as d`, [tokA], "anon")).rows[0].d === null
  && (await as(null, `select public.habit_widget($1) as d`, [nyTok], "anon")).rows[0].d !== null);

console.log(`\n${pass} OK, ${fail} misslyckade`);
process.exit(fail ? 1 : 0);
