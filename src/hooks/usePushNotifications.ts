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

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
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
        setIsSubscribed(!!(data && data.length > 0));
      });
  }, [isSupported, user]);

  // Listen for foreground FCM messages
  useEffect(() => {
    if (!isSupported) return;

    let unsubscribe: (() => void) | undefined;
    onFCMMessage((payload) => {
      console.log("[FCM] Foreground message:", payload);
      // Foreground notifications are handled by NotificationBell via realtime
    }).then((unsub) => {
      if (typeof unsub === "function") unsubscribe = unsub;
    });

    return () => unsubscribe?.();
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user) return false;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      // Get FCM token using Firebase's dedicated messaging service worker scope
      const fcmToken = await getFCMToken(VAPID_KEY);
      if (!fcmToken) {
        console.error("Failed to get FCM token");
        return false;
      }

      // Save FCM token to database
      await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: fcmToken, // FCM token stored as endpoint
          p256dh: "fcm", // marker to identify FCM tokens
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
      // Remove all push subscriptions for this user
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
