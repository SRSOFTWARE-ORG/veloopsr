const APP_SW_PATH = "/sw.js";

const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

const isPreviewHost = () => {
  const host = window.location.hostname;
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
};

const unregisterAppWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => {
        const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? "";
        return /\/(?:sw|sw-push)\.js(?:$|\?)/.test(script);
      })
      .map((registration) => registration.unregister()),
  );
};

export const registerAppServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!("serviceWorker" in navigator)) return null;

  const disabled = new URLSearchParams(window.location.search).get("sw") === "off";
  if (!import.meta.env.PROD || isInIframe() || isPreviewHost() || disabled) {
    await unregisterAppWorkers();
    return null;
  }

  const registration = await navigator.serviceWorker.register(APP_SW_PATH, { scope: "/" });
  await registration.update();
  return registration;
};

export const getAppServiceWorkerRegistration = async () => {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active?.scriptURL.includes(APP_SW_PATH)) return existing;
  return registerAppServiceWorker();
};

export const startAppServiceWorker = () => {
  let reloading = false;
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void registerAppServiceWorker()
      .then((registration) => {
        if (!registration) return;
        window.setInterval(() => void registration.update(), 60_000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void registration.update();
        });
      })
      .catch(() => undefined);
  });
};