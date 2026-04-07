import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getFCMToken, onFCMMessage } from "@/lib/firebase";

const VAPID_KEY = "BPy_U9RKwaP6QOrq9knqdImvlJntnxCL9kgyHXNFEQtV-zX06JDox6AcT5hqSPEvWbQweTAdnb1IDoBq77zsFFk";

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  // Sync permission state continuously
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    // Listen to permission changes via the Permissions API
    let cleanup: (() => void) | undefined;
    navigator.permissions?.query({ name: "notifications" }).then((status) => {
      const onChange = () => {
        setPermission(status.state as NotificationPermission);
        // If permission was revoked, mark as unsubscribed
        if (status.state === "denied") {
          setIsSubscribed(false);
        }
      };
      status.addEventListener("change", onChange);
      cleanup = () => status.removeEventListener("change", onChange);
    }).catch(() => {});

    return () => cleanup?.();
  }, []);

  // Check existing FCM token in database
  useEffect(() => {
    if (!isSupported || !user) return;

    supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .then(({ data }) => {
        const hasToken = !!(data && data.length > 0);
        // Only mark as subscribed if we have a token AND permission is granted
        setIsSubscribed(hasToken && Notification.permission === "granted");
      });
  }, [isSupported, user]);

  // Listen for foreground FCM messages
  useEffect(() => {
    if (!isSupported) return;

    let unsubscribe: (() => void) | undefined;
    onFCMMessage((payload) => {
      console.log("[FCM] Foreground message:", payload);
    }).then((unsub) => {
      if (typeof unsub === "function") unsubscribe = unsub;
    });

    return () => unsubscribe?.();
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user) return false;

    // Check if permission is denied — show instructions
    if (Notification.permission === "denied") {
      showDeniedAlert();
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        if (perm === "denied") {
          showDeniedAlert();
        }
        return false;
      }

      // Get FCM token
      const fcmToken = await getFCMToken(VAPID_KEY);
      if (!fcmToken) {
        console.error("Failed to get FCM token");
        return false;
      }

      // Save FCM token to database
      await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: fcmToken,
          p256dh: "fcm",
          auth: "fcm",
        },
        { onConflict: "user_id,endpoint" }
      );

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("FCM subscription failed:", err);
      return false;
    }
  }, [isSupported, user]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !user) return;

    try {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id);

      setIsSubscribed(false);
    } catch (err) {
      console.error("FCM unsubscribe failed:", err);
    }
  }, [isSupported, user]);

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
}

function showDeniedAlert() {
  const isAndroid = /android/i.test(navigator.userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  let instructions = "";
  if (isAndroid) {
    instructions =
      "📱 Android:\n1. Toque no ícone de cadeado (🔒) na barra de endereço\n2. Toque em 'Permissões' ou 'Configurações do site'\n3. Ative 'Notificações'\n4. Recarregue a página";
  } else if (isIOS) {
    instructions =
      "📱 iPhone/iPad:\n1. Abra Ajustes > Safari > Notificações\n2. Encontre 'Veloop' e ative as notificações\n3. Volte ao app e recarregue a página";
  } else {
    instructions =
      "💻 Desktop:\n1. Clique no ícone de cadeado (🔒) ao lado da URL\n2. Clique em 'Configurações do site' ou 'Permissões'\n3. Altere 'Notificações' para 'Permitir'\n4. Recarregue a página";
  }

  alert(
    "🔔 Notificações Bloqueadas\n\nAs notificações foram bloqueadas no seu navegador. Para reativá-las:\n\n" +
      instructions
  );
}
