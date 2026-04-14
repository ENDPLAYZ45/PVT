/**
 * Encrypt a plaintext message using the receiver's RSA-OAEP public key.
 * Returns a base64-encoded ciphertext string.
 */
export async function encryptMessage(
  publicKeyJwk: JsonWebKey,
  plaintext: string
): Promise<string> {
  // Import the receiver's public key from JWK
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  // Encode plaintext to bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    data
  );

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(encrypted);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
