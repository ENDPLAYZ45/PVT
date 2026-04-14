const DB_NAME = "PVT_CryptoDB";
const STORE_NAME = "keyStore";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storePrivateKey(
  userId: string,
  privateKey: CryptoKey
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ id: `privateKey:${userId}`, key: privateKey });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPrivateKey(
  userId: string
): Promise<CryptoKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(`privateKey:${userId}`);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.key : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function hasPrivateKey(userId: string): Promise<boolean> {
  const key = await getPrivateKey(userId);
  return key !== null;
}
