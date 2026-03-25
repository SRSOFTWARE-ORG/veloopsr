import { useState, useEffect, useCallback } from "react";

export interface PermissionStatus {
  name: string;
  label: string;
  icon: string;
  state: "granted" | "denied" | "prompt" | "unsupported";
  request: () => Promise<void>;
}

export function useDevicePermissions() {
  const [permissions, setPermissions] = useState<PermissionStatus[]>([]);

  const updatePermission = (name: string, state: PermissionStatus["state"]) => {
    setPermissions((prev) =>
      prev.map((p) => (p.name === name ? { ...p, state } : p))
    );
  };

  const requestNotification = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    updatePermission("notifications", result as PermissionStatus["state"]);
  }, []);

  const requestCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      updatePermission("camera", "granted");
    } catch {
      updatePermission("camera", "denied");
    }
  }, []);

  const requestMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      updatePermission("microphone", "granted");
    } catch {
      updatePermission("microphone", "denied");
    }
  }, []);

  const requestGeolocation = useCallback(async () => {
    if (!("geolocation" in navigator)) return;
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          updatePermission("geolocation", "granted");
          resolve();
        },
        () => {
          updatePermission("geolocation", "denied");
          resolve();
        }
      );
    });
  }, []);

  // For files/gallery - these don't need explicit permission in browsers,
  // they work via <input type="file"> but we show status
  const requestFiles = useCallback(async () => {
    // File access is always available via input elements in browsers
    updatePermission("files", "granted");
  }, []);

  useEffect(() => {
    const checkPermissions = async () => {
      const perms: PermissionStatus[] = [];

      // Notifications
      if ("Notification" in window) {
        perms.push({
          name: "notifications",
          label: "Notificações",
          icon: "Bell",
          state: Notification.permission as PermissionStatus["state"],
          request: requestNotification,
        });
      }

      // Camera
      if (navigator.mediaDevices?.getUserMedia) {
        let camState: PermissionStatus["state"] = "prompt";
        try {
          const status = await navigator.permissions.query({ name: "camera" as PermissionName });
          camState = status.state as PermissionStatus["state"];
        } catch {}
        perms.push({
          name: "camera",
          label: "Câmera",
          icon: "Camera",
          state: camState,
          request: requestCamera,
        });
      }

      // Microphone
      if (navigator.mediaDevices?.getUserMedia) {
        let micState: PermissionStatus["state"] = "prompt";
        try {
          const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
          micState = status.state as PermissionStatus["state"];
        } catch {}
        perms.push({
          name: "microphone",
          label: "Microfone",
          icon: "Mic",
          state: micState,
          request: requestMicrophone,
        });
      }

      // Geolocation
      if ("geolocation" in navigator) {
        let geoState: PermissionStatus["state"] = "prompt";
        try {
          const status = await navigator.permissions.query({ name: "geolocation" });
          geoState = status.state as PermissionStatus["state"];
        } catch {}
        perms.push({
          name: "geolocation",
          label: "Localização",
          icon: "MapPin",
          state: geoState,
          request: requestGeolocation,
        });
      }

      // Files / Gallery - always available in browsers
      perms.push({
        name: "files",
        label: "Arquivos e Galeria",
        icon: "FolderOpen",
        state: "granted",
        request: requestFiles,
      });

      setPermissions(perms);
    };

    checkPermissions();
  }, [requestNotification, requestCamera, requestMicrophone, requestGeolocation, requestFiles]);

  const requestAll = useCallback(async () => {
    for (const perm of permissions) {
      if (perm.state === "prompt") {
        await perm.request();
      }
    }
  }, [permissions]);

  return { permissions, requestAll };
}
