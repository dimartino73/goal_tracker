import { useCallback, useEffect, useState } from "react";
import widgetSource from "../../widget/dagraknare-widget.cjs?raw";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../lib/supabase";
import { sync, useSyncInfo } from "../lib/store";
import { copyText } from "../lib/hooks";
import { Icon, SyncBadge } from "./parts";

/** Fyller i de fyra värdena överst i widget-skriptet. */
export function buildWidgetScript(token: string): string {
  return widgetSource
    .replace("__SUPABASE_URL__", SUPABASE_URL ?? "")
    .replace("__SUPABASE_ANON_KEY__", SUPABASE_ANON_KEY ?? "")
    .replace("__WIDGET_TOKEN__", token)
    .replace("__APP_URL__", `${location.origin}/`);
}

export default function Settings({ email }: { email: string }) {
  const info = useSyncInfo();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirmRotate, setConfirmRotate] = useState(false);

  const loadToken = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("habit_widget_tokens").select("token").maybeSingle();
    if (error) { setErr(error.message); setToken(null); return; }
    setToken(data?.token ?? null);
  }, []);
  useEffect(() => { void loadToken(); }, [loadToken]);

  async function createToken() {
    if (!supabase) return;
    setErr("");
    const { data, error } = await supabase.from("habit_widget_tokens").insert({}).select("token").single();
    if (error) return setErr(error.message);
    setToken(data.token);
  }

  async function rotateToken() {
    if (!supabase) return;
    setErr(""); setConfirmRotate(false);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("habit_widget_tokens").update({ token: crypto.randomUUID() }).eq("user_id", u.user?.id ?? "").select("token").single();
    if (error) return setErr(error.message);
    setToken(data.token);
    setMsg("Ny nyckel skapad. Kopiera skriptet igen och ersätt det i Scriptable. Det gamla slutar fungera.");
  }

  async function copyScript() {
    if (!token) return;
    const ok = await copyText(buildWidgetScript(token));
    setMsg(ok ? "Skriptet är kopierat. Klistra in det i ett nytt skript i Scriptable." : "Kunde inte kopiera. Tillåt urklipp för sidan och försök igen.");
  }

  return (
    <main className="shell">
      <div className="topbar">
        <a className="iconbtn" href="#/" aria-label="Tillbaka"><Icon name="back" /></a>
        <h1>Inställningar</h1>
      </div>

      <section className="card stack">
        <h2 className="h3" style={{ margin: 0 }}>Konto och synk</h2>
        <div className="sub">Inloggad som {email}</div>
        <div><SyncBadge /></div>
        {info.status === "error" && info.message && <div className="error">{info.message}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={() => void sync()}>Synka nu</button>
          <button className="btn ghost" onClick={() => void supabase?.auth.signOut()}>Logga ut</button>
        </div>
      </section>

      <section className="card stack">
        <h2 className="h3" style={{ margin: 0 }}>Widget för hemskärmen</h2>
        <p style={{ margin: 0 }}>Widgeten körs av appen Scriptable (gratis i App Store). Den visar dina vanor men kan inte bocka av en dag. Det gör du här i appen.</p>
        {token === undefined && <p className="sub">Hämtar …</p>}
        {token === null && (
          <>
            <p className="sub" style={{ margin: 0 }}>Widgeten loggar inte in. Den läser med en egen nyckel som bara kan läsa dina vanor. Skapa nyckeln för att komma igång.</p>
            <button className="btn" onClick={() => void createToken()}>Skapa widget-nyckel</button>
          </>
        )}
        {token && (
          <>
            <ol className="steps">
              <li>Installera <b>Scriptable</b> från App Store.</li>
              <li>Tryck på <b>Kopiera widget-skript</b> nedan.</li>
              <li>I Scriptable: tryck <b>+</b>, klistra in och döp skriptet till "Dagräknare".</li>
              <li>Håll in hemskärmen, välj <b>+</b> → Scriptable, och välj skriptet.</li>
              <li>Vill du visa en särskild vana: skriv dess namn i widgetens <b>Parameter</b>. Tom parameter visar första vanan (stor widget visar flera).</li>
            </ol>
            <button className="btn block" onClick={() => void copyScript()}>Kopiera widget-skript</button>
            <p className="sub" style={{ margin: 0 }}>Skriptet innehåller din nyckel. Dela det inte. Vem som helst med nyckeln kan se dina vanor.</p>
            {confirmRotate ? (
              <div className="notice stack" role="alertdialog">
                <span>Byt nyckel? Den gamla widgeten slutar fungera tills du klistrat in det nya skriptet.</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn danger" onClick={() => void rotateToken()}>Byt nyckel</button>
                  <button className="btn ghost" onClick={() => setConfirmRotate(false)}>Avbryt</button>
                </div>
              </div>
            ) : (
              <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmRotate(true)}>Byt nyckel (om skriptet har kommit på avvägar)</button>
            )}
          </>
        )}
        {msg && <div className="notice" role="status">{msg}</div>}
        {err && <div className="error" role="alert">{err}</div>}
      </section>

      <section className="card stack">
        <h2 className="h3" style={{ margin: 0 }}>Lägg appen på hemskärmen</h2>
        <p style={{ margin: 0 }}>Öppna sidan i Safari, tryck på Dela och välj <b>Lägg till på hemskärmen</b>. Då startar den som en egen app och fungerar utan nät.</p>
      </section>
    </main>
  );
}
