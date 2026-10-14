import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

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
      if (error) setError(error.message === "Invalid login credentials" ? "Fel e-postadress eller lösenord." : error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
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
