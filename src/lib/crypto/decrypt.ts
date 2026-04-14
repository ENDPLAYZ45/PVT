/**
 * Decrypt a base64-encoded ciphertext using the user's private key from IndexedDB.
 * Returns the plaintext string. Never persists the result.
 */
export async function decryptMessage(
  privateKey: CryptoKey,
  ciphertextBase64: string
): Promise<string> {
  // Decode base64 to ArrayBuffer
  const binary = atob(ciphertextBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    bytes.buffer
  );

  // Decode ArrayBuffer to string
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
