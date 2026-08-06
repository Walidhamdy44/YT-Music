/**
 * offlineDb — single IDBDatabase instance shared by all offline stores.
 *
 * Having one place that opens the DB ensures `onupgradeneeded` fires exactly
 * once and all object stores are created in the correct version.
 *
 * Current schema
 *   v1: cached-tracks (audio file metadata)
 *   v2: no structural change (version bump only)
 *   v3: saved-urls (direct CDN URLs)
 */

const DB_NAME = "yt-music-offline";
export const DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => {
      console.error("[offlineDb] Failed to open:", req.error);
      reject(req.error);
    };

    req.onsuccess = () => {
      console.log(`[offlineDb] Opened at version ${req.result.version}`);
      resolve(req.result);
    };

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      console.log(`[offlineDb] Upgrading from v${oldVersion} → v${DB_VERSION}`);

      // v1: cached-tracks
      if (!db.objectStoreNames.contains("cached-tracks")) {
        const store = db.createObjectStore("cached-tracks", { keyPath: "videoId" });
        store.createIndex("cachedAt", "cachedAt", { unique: false });
        store.createIndex("lastPlayedAt", "lastPlayedAt", { unique: false });
        store.createIndex("isManualDownload", "isManualDownload", { unique: false });
        store.createIndex("artist", "artist", { unique: false });
        console.log("[offlineDb] Created cached-tracks store");
      }

      // v3: saved-urls
      if (!db.objectStoreNames.contains("saved-urls")) {
        const urlStore = db.createObjectStore("saved-urls", { keyPath: "videoId" });
        urlStore.createIndex("savedAt", "savedAt", { unique: false });
        urlStore.createIndex("expiresAt", "expiresAt", { unique: false });
        console.log("[offlineDb] Created saved-urls store");
      }
    };
  });

  return dbPromise;
}
