/**
 * offlineFolderStore — IndexedDB CRUD for offline folders.
 *
 * A folder is just an id + name + color + ordered list of videoIds.
 * It does NOT own the audio files — removing a folder never deletes the songs,
 * it only removes the association.
 */

import { getOfflineDb } from "./offlineDb";

const STORE = "offline-folders";

export interface OfflineFolder {
  id: string;           // uuid-ish, generated on create
  name: string;
  color: string;        // tailwind-safe hex or named colour, e.g. "#6366f1"
  videoIds: string[];   // ordered list — first item is used as cover art
  createdAt: number;
  updatedAt: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  // crypto.randomUUID is available in all modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function getDb() {
  return getOfflineDb();
}

// ── public API ────────────────────────────────────────────────────────────────

export async function getAllFolders(): Promise<OfflineFolder[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        ((req.result as OfflineFolder[]) || []).sort(
          (a, b) => a.createdAt - b.createdAt
        )
      );
    req.onerror = () => reject(req.error);
  });
}

export async function getFolder(id: string): Promise<OfflineFolder | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function createFolder(
  name: string,
  color: string
): Promise<OfflineFolder> {
  const now = Date.now();
  const folder: OfflineFolder = {
    id: uuid(),
    name: name.trim(),
    color,
    videoIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(folder);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return folder;
}

export async function updateFolder(
  id: string,
  updates: Partial<Pick<OfflineFolder, "name" | "color" | "videoIds">>
): Promise<OfflineFolder | null> {
  const existing = await getFolder(id);
  if (!existing) return null;
  const updated: OfflineFolder = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return updated;
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Add a song to a folder (idempotent). */
export async function addSongToFolder(
  folderId: string,
  videoId: string
): Promise<void> {
  const folder = await getFolder(folderId);
  if (!folder) return;
  const ids = folder.videoIds ?? [];
  if (ids.includes(videoId)) return;
  await updateFolder(folderId, { videoIds: [...ids, videoId] });
}

/** Remove a song from a folder (does NOT delete the audio). */
export async function removeSongFromFolder(
  folderId: string,
  videoId: string
): Promise<void> {
  const folder = await getFolder(folderId);
  if (!folder) return;
  await updateFolder(folderId, {
    videoIds: (folder.videoIds ?? []).filter((v) => v !== videoId),
  });
}

/** Remove a song from ALL folders (called when a song is deleted). */
export async function removeSongFromAllFolders(videoId: string): Promise<void> {
  const folders = await getAllFolders();
  for (const f of folders) {
    if ((f.videoIds ?? []).includes(videoId)) {
      await removeSongFromFolder(f.id, videoId);
    }
  }
}

/** Return the folder ids that contain a given song. */
export async function getFoldersForSong(
  videoId: string
): Promise<OfflineFolder[]> {
  const folders = await getAllFolders();
  return folders.filter((f) => (f.videoIds ?? []).includes(videoId));
}
