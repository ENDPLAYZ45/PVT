"use client";

import { useEffect, useState } from "react";
import { getPrivateKey, hasPrivateKey } from "@/lib/crypto/indexeddb";

export function usePrivateKey(userId: string | undefined) {
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    async function loadKey() {
      try {
        const exists = await hasPrivateKey(userId!);
        setHasKey(exists);
        if (exists) {
          const key = await getPrivateKey(userId!);
          setPrivateKey(key);
        }
      } catch (err) {
        console.error("Failed to load private key from IndexedDB:", err);
      } finally {
        setLoading(false);
      }
    }

    loadKey();
  }, [userId]);

  return { privateKey, hasKey, loading };
}
