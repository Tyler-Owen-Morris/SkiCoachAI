// Tiny IndexedDB key-value helper, used only by the browser build (the iOS app
// stores data in native SQLite and audio in files).

const DB_NAME = "skicoach-web";
const STORES = ["db", "audio"] as const;
type Store = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const idbGet = <T>(store: Store, key: string) => tx<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: Store, key: string, value: unknown) =>
  tx(store, "readwrite", (s) => s.put(value, key)).then(() => undefined);
export const idbDelete = (store: Store, key: string) =>
  tx(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
