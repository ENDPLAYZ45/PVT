"use client";

import { useEffect, useState } from "react";
import { getPrivateKey, hasPrivateKey, storePrivateKey } from "@/lib/crypto/indexeddb";
import { generateKeyPair } from "@/lib/crypto/keygen";
import { createClient } from "@/lib/supabase/client";

export function usePrivateKey(userId: string | undefined) {
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    async function loadOrGenerateKey() {
      try {
        const exists = await hasPrivateKey(userId!);

        if (exists) {
          // Key found — load it normally
          const key = await getPrivateKey(userId!);
          setPrivateKey(key);
          setHasKey(true);
        } else {
          // No key found — auto-generate a new key pair and upload public key
          console.log("No key found — generating new key pair...");
          const { publicKeyJwk, privateKey: newPrivateKey } = await generateKeyPair();

          // Store private key in IndexedDB
          await storePrivateKey(userId!, newPrivateKey);

          // Upload new public key to Supabase
          const supabase = createClient();
          await supabase
            .from("users")
            .update({ public_key: JSON.stringify(publicKeyJwk) })
            .eq("id", userId!);

          setPrivateKey(newPrivateKey);
          setHasKey(true);
        }
      } catch (err) {
        console.error("Failed to load/generate private key:", err);
        setHasKey(false);
      } finally {
        setLoading(false);
      }
    }

    loadOrGenerateKey();
  }, [userId]);

  return { privateKey, hasKey, loading };
}
