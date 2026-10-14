import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/600.css";
import App from "./App";
import "./styles.css";

// Kollar efter en ny version var 30:e minut medan appen är öppen. Utan det
// uppdaterar sig en PWA som ligger kvar på hemskärmen bara vid en riktig
// sidladdning. autoUpdate (vite.config.ts) aktiverar och laddar om tyst.
registerSW({
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 30 * 60 * 1000);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
