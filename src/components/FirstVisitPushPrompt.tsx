import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { isPushSupported, requestPushPermissionAndSubscribe } from "@/lib/pushNotifications";
import { toast } from "sonner";

const FLAG = "veloop_push_prompt_v1";

export default function FirstVisitPushPrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPushSupported()) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(FLAG) === "true") return;
    const t = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const handleAllow = async () => {
    setBusy(true);
    const res = await requestPushPermissionAndSubscribe();
    setBusy(false);
    localStorage.setItem(FLAG, "true");
    setOpen(false);
    if (res.ok) toast.success("Notificações ativadas!");
    else if (res.reason === "denied") toast.info("Você pode ativar depois nas configurações do navegador.");
  };

  const handleSkip = () => {
    localStorage.setItem(FLAG, "true");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-7 h-7 text-primary" />
          </div>
          <DialogTitle className="text-center">Ativar notificações?</DialogTitle>
          <DialogDescription className="text-center">
            Receba avisos de cobranças, pagamentos e mensagens mesmo com o app fechado.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={handleSkip} disabled={busy}>
            Agora não
          </Button>
          <Button className="flex-1" onClick={handleAllow} disabled={busy}>
            {busy ? "Ativando..." : "Ativar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
