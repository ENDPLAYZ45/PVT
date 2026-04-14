/**
 * Generate an RSA-OAEP 2048-bit key pair.
 * - extractablePrivateKey: needed for wrapKey (password-based cloud backup)
 * - The stored version in IndexedDB uses the non-extractable form.
 */
export async function generateKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;        // non-extractable (for IndexedDB)
  extractablePrivateKey: CryptoKey; // extractable (for password-wrapping)
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable — needed to export public key and wrap private key
    ["encrypt", "decrypt"]
  );

  // Export public key as JWK to store in Supabase
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  // Re-import private key as non-extractable for secure IndexedDB storage
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const nonExtractablePrivateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, // non-extractable
    ["decrypt"]
  );

  return {
    publicKeyJwk,
    privateKey: nonExtractablePrivateKey,
    extractablePrivateKey: keyPair.privateKey, // extractable — used for wrapKey
  };
}
