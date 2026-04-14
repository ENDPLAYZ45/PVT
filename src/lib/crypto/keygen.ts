/**
 * Generate an RSA-OAEP 2048-bit key pair.
 * - The private key is non-extractable (stored as CryptoKey in IndexedDB).
 * - The public key is extractable so it can be exported as JWK for the database.
 */
export async function generateKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}> {
  // Generate key pair — extractable controls whether key material can be read
  // We generate with extractable: true first, then we'll store the private key
  // as a non-extractable CryptoKey by re-importing it
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable — needed so we can export the public key
    ["encrypt", "decrypt"]
  );

  // Export public key as JWK to store in Supabase
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  // Export private key as JWK, then re-import as non-extractable
  const privateKeyJwk = await crypto.subtle.exportKey(
    "jwk",
    keyPair.privateKey
  );
  const nonExtractablePrivateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, // non-extractable — cannot be read by JS/XSS
    ["decrypt"]
  );

  return {
    publicKeyJwk,
    privateKey: nonExtractablePrivateKey,
  };
}
