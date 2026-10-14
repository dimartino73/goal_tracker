import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import { initStore, resetStore, scheduleSync, sync } from "./lib/store";
import { useRoute } from "./lib/hooks";
import Login from "./views/Login";
import HabitList from "./views/HabitList";
import HabitView from "./views/HabitView";
import HabitForm from "./views/HabitForm";
import Settings from "./views/Settings";

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (uid) initStore(uid);
    else resetStore();
  }, [uid]);

  // Synka när appen kommer i förgrunden eller nätet kommer tillbaka.
  useEffect(() => {
    if (!uid) return;
    const visible = () => { if (document.visibilityState === "visible") void sync(); };
    const online = () => scheduleSync(200);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    return () => { document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", online); };
  }, [uid]);

  if (!configured) {
    return (
      <main className="shell">
        <div className="card stack">
          <h1 className="num">Saknar Supabase-uppgifter</h1>
          <p>Appen byggdes utan <code>VITE_SUPABASE_URL</code> och <code>VITE_SUPABASE_ANON_KEY</code>. Lägg in dem som miljövariabler (se README) och bygg om.</p>
        </div>
      </main>
    );
  }
  if (session === undefined) return <main className="shell"><p className="sub">Laddar …</p></main>;
  if (!session) return <Login />;

  const [a, b, c] = route;
  if (a === "ny") return <HabitForm />;
  if (a === "installningar") return <Settings email={session.user.email ?? ""} />;
  if (a === "h" && b && c === "redigera") return <HabitForm id={b} />;
  if (a === "h" && b) return <HabitView id={b} tab={c === "kalender" || c === "statistik" ? c : "idag"} />;
  return <HabitList />;
}
