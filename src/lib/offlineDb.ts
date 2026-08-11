/**
 * offlineDb — single IDBDatabase instance shared by all offline stores.
 *
 * Current schema
 *   v1: cached-tracks (audio file metadata)
 *   v2: no structural change (version bump only)
 *   v3: saved-urls (direct CDN URLs)
 *   v4: offline-folders (user-created folders for organising downloaded songs)
 */

const DB_NAME = "yt-music-offline";
export const DB_VERSION = 4;

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

      // v4: offline-folders
      if (!db.objectStoreNames.contains("offline-folders")) {
        const folderStore = db.createObjectStore("offline-folders", { keyPath: "id" });
        folderStore.createIndex("createdAt", "createdAt", { unique: false });
        console.log("[offlineDb] Created offline-folders store");
      }
    };
  });

  return dbPromise;
}
