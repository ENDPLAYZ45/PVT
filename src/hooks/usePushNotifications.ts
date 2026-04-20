"use client";

import { useEffect, useState, useCallback } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer.buffer;
}

export function usePushNotifications(userId: string | undefined) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const supported = "serviceWorker" in navigator && "PushManager" in window;
      setIsSupported(supported);
      if (supported && "Notification" in window) {
        setPermission(Notification.permission);
      }
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return;
    setLoading(true);

    try {
      // 1. Register/Get Service Worker
      const reg = await navigator.serviceWorker.ready;
      
      // 2. Request permission (MUST be called from a user gesture)
      const res = await Notification.requestPermission();
      setPermission(res);
      
      if (res !== "granted") {
        setLoading(false);
        return;
      }

      // 3. Get or create subscription
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // 4. Send to backend
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub }),
      });

      if (response.ok) {
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error("Subscription failed:", err);
    } finally {
      setLoading(false);
    }
  }, [isSupported, userId]);

  // Check initial subscription status
  useEffect(() => {
    if (isSupported && userId) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, [isSupported, userId]);

  return {
    isSupported,
    permission,
    isSubscribed,
    subscribe,
    loading
  };
}
