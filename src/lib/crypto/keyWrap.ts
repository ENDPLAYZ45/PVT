/**
 * Password-Based Key Wrapping (PBKDF2 + AES-GCM)
 *
 * This allows the RSA private key to be safely stored in Supabase,
 * encrypted with a key derived from the user's password.
 * On any new device, the user logs in with their password and their
 * private key is recovered — exactly like WhatsApp/Signal backup.
 */

/** Derive a 256-bit AES-GCM wrapping key from a password + salt */
async function deriveWrappingKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 200_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

/**
 * Encrypt (wrap) the RSA private key using the user's password.
 * Returns base64-encoded { salt, iv, wrappedKey } packed into one string.
 */
export async function encryptPrivateKeyWithPassword(
  privateKey: CryptoKey,
  password: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(password, salt);

  const wrapped = await crypto.subtle.wrapKey("pkcs8", privateKey, wrappingKey, {
    name: "AES-GCM",
    iv,
  });

  // Pack salt (16) + iv (12) + wrapped key into one Uint8Array
  const combined = new Uint8Array(16 + 12 + wrapped.byteLength);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(new Uint8Array(wrapped), 28);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt (unwrap) the RSA private key using the user's password.
 * Returns a non-extractable CryptoKey ready for decryption.
 */
export async function decryptPrivateKeyWithPassword(
  encryptedKeyB64: string,
  password: string
): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(encryptedKeyB64), (c) => c.charCodeAt(0));

  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const wrappedKey = bytes.slice(28);

  const wrappingKey = await deriveWrappingKey(password, salt);

  return crypto.subtle.unwrapKey(
    "pkcs8",
    wrappedKey,
    wrappingKey,
    { name: "AES-GCM", iv },
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, // non-extractable
    ["decrypt"]
  );
}
