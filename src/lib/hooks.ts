import { useEffect, useState } from "react";
import { todayFor } from "./dates";

/** Läser hashen: "#/h/abc/kalender" → ["h", "abc", "kalender"]. */
export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path: string) => { location.hash = path; };

/**
 * Dagens datum för en vana. Räknas om när appen kommer i förgrunden och en
 * gång i halvminuten, så att en PWA som legat öppen över midnatt byter dag.
 */
export function useToday(rolloverHour: number): string {
  const [today, setToday] = useState(() => todayFor(rolloverHour));
  useEffect(() => {
    const update = () => setToday(todayFor(rolloverHour));
    update();
    const id = setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [rolloverHour]);
  return today;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { return document.execCommand("copy"); } finally { ta.remove(); }
  }
}
