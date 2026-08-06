/**
 * SavedUrlStore — IndexedDB store for saved YouTube CDN URLs.
 *
 * "Save URL" mode: stores the direct CDN URL for a track so the player can
 * use it without calling the backend again. Requires internet to actually
 * stream (unlike full offline), but avoids backend round-trips.
 *
 * URLs expire in ~6 hours (YouTube signed URL TTL).
 */

import type { Track } from "@/types";
import { getOfflineDb } from "./offlineDb";

export interface SavedUrl {
  videoId: string;
  url: string;
  expiresAt: number;    // ms timestamp — 0 means unknown
  savedAt: number;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  thumbnailLarge?: string;
  album?: string;
}

const STORE_NAME = "saved-urls";

// Treat URL as expired 10 min before YouTube's actual expiry (buffer for slow connections)
const EXPIRY_BUFFER_MS = 10 * 60 * 1000;

class SavedUrlStore {
  private static instance: SavedUrlStore;

  private constructor() {}

  static getInstance(): SavedUrlStore {
    if (!SavedUrlStore.instance) {
      SavedUrlStore.instance = new SavedUrlStore();
    }
    return SavedUrlStore.instance;
  }

  private async getDb(): Promise<IDBDatabase> {
    return getOfflineDb();
  }

  /** Save a URL entry */
  async save(entry: SavedUrl): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** Get a saved URL entry by videoId */
  async get(videoId: string): Promise<SavedUrl | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(videoId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  /** Get all saved URL entries */
  async getAll(): Promise<SavedUrl[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  /** Delete a saved URL */
  async delete(videoId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(videoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** Clear all saved URLs */
  async clearAll(): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** Check if a saved URL entry is still valid */
  isValid(entry: SavedUrl): boolean {
    if (!entry.expiresAt) return true;
    return Date.now() < entry.expiresAt - EXPIRY_BUFFER_MS;
  }

  /** Get a valid URL for a videoId, or null if expired/missing */
  async getValidUrl(videoId: string): Promise<string | null> {
    try {
      const entry = await this.get(videoId);
      if (!entry) return null;
      if (!this.isValid(entry)) {
        console.log(`[SavedUrlStore] URL expired for ${videoId}`);
        return null;
      }
      return entry.url;
    } catch {
      return null;
    }
  }

  /** Create a SavedUrl from a track + resolved URL data */
  static createEntry(track: Track, url: string, expiresAt: number): SavedUrl {
    return {
      videoId: track.videoId,
      url,
      expiresAt,
      savedAt: Date.now(),
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
      thumbnailLarge: track.thumbnailLarge,
      duration: track.duration,
      album: track.album,
    };
  }
}

export const savedUrlStore = SavedUrlStore.getInstance();
export { SavedUrlStore };
