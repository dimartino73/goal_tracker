import { useState, type FormEvent } from "react";
import { SUPABASE_URL, supabase } from "../lib/supabase";

// "Failed to fetch" säger bara att anropet aldrig nådde fram. Visa vart det försökte gå,
// eftersom en felskriven VITE_SUPABASE_URL är den vanligaste orsaken.
function explain(message: string): string {
  if (!/failed to fetch|networkerror|load failed/i.test(message)) return message;
  let host = String(SUPABASE_URL);
  try { host = new URL(String(SUPABASE_URL)).host; } catch { /* ogiltig adress, visa rått */ }
  return `Kunde inte nå Supabase (${host}). Kontrollera att VITE_SUPABASE_URL är projektets adress, t.ex. https://abcdefgh.supabase.co, och att nätet fungerar.`;
}

export default function Login() {
  const [mode, setMode] = useState<"in" | "ny">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(""); setInfo("");
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "Fel e-postadress eller lösenord." : explain(error.message));
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(explain(error.message));
      else if (!data.session) setInfo("Kontot är skapat. Bekräfta e-postadressen via länken i mejlet och logga sedan in.");
    }
    setBusy(false);
  }

  return (
    <main className="shell" style={{ justifyContent: "center" }}>
      <form className="card stack" onSubmit={submit}>
        <h1 className="num" style={{ fontSize: 30 }}>Dagräknare</h1>
        <p className="sub" style={{ margin: 0 }}>{mode === "in" ? "Logga in för att se dina vanor." : "Skapa ett konto. Dina vanor sparas och följer med mellan enheter."}</p>
        <div className="field">
          <label htmlFor="email">E-post</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Lösenord</label>
          <input id="pw" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === "ny" && <span className="hint">Minst 8 tecken.</span>}
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {info && <div className="notice">{info}</div>}
        <button className="btn block" disabled={busy}>{busy ? "Vänta …" : mode === "in" ? "Logga in" : "Skapa konto"}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === "in" ? "ny" : "in"); setError(""); setInfo(""); }}>
          {mode === "in" ? "Ny här? Skapa konto" : "Har du redan konto? Logga in"}
        </button>
      </form>
    </main>
  );
}
