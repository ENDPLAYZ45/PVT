import { encryptMessage } from "./encrypt";

/** Encrypt an image file with AES-GCM, then RSA-wrap the AES key for both parties */
export async function encryptImageForUpload(
  file: File,
  receiverPublicKeyJwk: JsonWebKey,
  senderPublicKeyJwk: JsonWebKey
): Promise<{
  encryptedBlob: Blob;
  ivBase64: string;
  aesKeyForReceiver: string;  // RSA-encrypted AES key JWK (for receiver)
  aesKeyForSender: string;    // RSA-encrypted AES key JWK (for sender)
  mimeType: string;
}> {
  // 1. Generate random AES-GCM key
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Export AES key as JWK string
  const aesKeyJwk = await crypto.subtle.exportKey("jwk", aesKey);
  const aesKeyString = JSON.stringify(aesKeyJwk);

  // 3. Encrypt image bytes with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer.slice(0) as ArrayBuffer },
    aesKey,
    fileBuffer
  );

  // 4. RSA-encrypt the AES key string for both receiver and sender
  const aesKeyForReceiver = await encryptMessage(receiverPublicKeyJwk, aesKeyString);
  const aesKeyForSender = await encryptMessage(senderPublicKeyJwk, aesKeyString);

  return {
    encryptedBlob: new Blob([new Uint8Array(encrypted)], { type: "application/octet-stream" }),
    ivBase64: btoa(String.fromCharCode(...iv)),
    aesKeyForReceiver,
    aesKeyForSender,
    mimeType: file.type,
  };
}

/** Decrypt an image fetched from Supabase Storage */
export async function decryptImageBlob(
  encryptedData: ArrayBuffer,
  aesKeyJwkString: string,
  ivBase64: string,
  mimeType: string
): Promise<string> {
  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
  const aesKeyJwk = JSON.parse(aesKeyJwkString) as JsonWebKey;

  const aesKey = await crypto.subtle.importKey(
    "jwk",
    aesKeyJwk,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer.slice(0) as ArrayBuffer },
    aesKey,
    encryptedData
  );

  const blob = new Blob([decrypted], { type: mimeType || "image/jpeg" });
  return URL.createObjectURL(blob);
}
