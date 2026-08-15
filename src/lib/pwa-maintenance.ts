/**
 * Ponte entre o app e o service worker para o modo "fora do ar".
 *
 * Mesmo em PWAs desatualizados o service worker bloqueia a navegação quando a
 * manutenção está ativa. Estas funções liberam (ou revogam) esse bloqueio para
 * o usuário autorizado que entrou pela aba /acesso.
 */

const post = async (message: Record<string, unknown>): Promise<boolean> => {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const target = reg.active ?? navigator.serviceWorker.controller;
    if (!target) return false;
    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
};

/** Libera navegação no SW por um período curto (renovado a cada acesso). */
export const allowPwaBypass = async (hours = 6) =>
  post({ type: "veloop-maintenance-bypass", until: Date.now() + hours * 60 * 60 * 1000 });

/** Remove qualquer liberação ativa (usado ao reativar o app ou ao sair). */
export const clearPwaBypass = async () => post({ type: "veloop-maintenance-bypass-clear" });
