import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getPerformance } from "firebase/performance";
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported } from "firebase/messaging";
import { fetchAndActivate, getRemoteConfig, getValue } from "firebase/remote-config";

const firebaseConfig = {
  apiKey: "AIzaSyAxN7XUraOmXRG6q8SNiFfVZdwwQRlp8xw",
  authDomain: "veloop-cebae.firebaseapp.com",
  projectId: "veloop-cebae",
  storageBucket: "veloop-cebae.firebasestorage.app",
  messagingSenderId: "862663443766",
  appId: "1:862663443766:web:b09dcc82ec2c4ca1a49f97",
  measurementId: "G-8QWNZXB1V2",
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);

// Analytics — only in browser contexts that support it
export const initAnalytics = async () => {
  try {
    const supported = await isAnalyticsSupported();
    if (supported) {
      return getAnalytics(firebaseApp);
    }
  } catch {
    console.warn("Firebase Analytics not supported in this environment");
  }
  return null;
};

// Performance Monitoring
export const initPerformance = () => {
  try {
    return getPerformance(firebaseApp);
  } catch {
    console.warn("Firebase Performance not supported in this environment");
    return null;
  }
};

// Remote Config
export const initRemoteConfig = async () => {
  try {
    const remoteConfig = getRemoteConfig(firebaseApp);
    remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 hour
    remoteConfig.defaultConfig = {
      maintenance_mode: false,
      feature_assistencia: true,
      feature_agenda: true,
    };
    await fetchAndActivate(remoteConfig);
    return remoteConfig;
  } catch {
    console.warn("Firebase Remote Config not available");
    return null;
  }
};

export const getRemoteConfigValue = (config: ReturnType<typeof getRemoteConfig>, key: string) => {
  try {
    return getValue(config, key);
  } catch {
    return null;
  }
};

// Cloud Messaging (FCM)
export const initMessaging = async () => {
  try {
    const supported = await isMessagingSupported();
    if (supported) {
      return getMessaging(firebaseApp);
    }
  } catch {
    console.warn("Firebase Messaging not supported");
  }
  return null;
};

export const getFCMToken = async (vapidKey: string) => {
  const messaging = await initMessaging();
  if (!messaging) return null;

  try {
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js"),
    });
    return token;
  } catch (err) {
    console.error("Failed to get FCM token:", err);
    return null;
  }
};

export const onFCMMessage = async (callback: (payload: any) => void) => {
  const messaging = await initMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
};
