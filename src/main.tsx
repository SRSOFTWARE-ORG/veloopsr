import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startAppServiceWorker } from "@/lib/app-service-worker";

// Registro único: o Workbox cuida do offline e importa o bloqueio de manutenção/push.
startAppServiceWorker();

// Auto-recover from stale chunk errors after a redeploy.
// When the client tries to load a JS chunk that no longer exists,
// reload once (guarded via sessionStorage) to fetch the fresh index.html.
const RELOAD_KEY = "__chunk_reload_at__";
const isChunkLoadError = (msg: string) =>
  /Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk \d+ failed|ChunkLoadError|error loading dynamically imported module/i.test(
    msg
  );

const tryReloadOnce = () => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    if (Date.now() - last < 10_000) return; // avoid loops
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  } catch {
    window.location.reload();
  }
};

window.addEventListener("error", (e) => {
  const msg = e?.message || "";
  if (isChunkLoadError(msg)) tryReloadOnce();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = (e?.reason?.message || String(e?.reason || "")) as string;
  if (isChunkLoadError(msg)) tryReloadOnce();
});

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
