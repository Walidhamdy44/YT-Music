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

export interface SavedUrl {
  videoId: string;
  url: string;
  expiresAt: number;    // ms timestamp — 0 means unknown
  savedAt: number;
  // Track metadata (for display)
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  thumbnailLarge?: string;
  album?: string;
}

const DB_NAME = "yt-music-offline";
const STORE_NAME = "saved-urls";
const DB_VERSION = 3; // bump from 2 → 3 to add the new store

// URL TTL — treat as expired 10 min before YouTube's actual expiry to give
// some buffer for slow connections
const EXPIRY_BUFFER_MS = 10 * 60 * 1000;

class SavedUrlStore {
  private static instance: SavedUrlStore;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): SavedUrlStore {
    if (!SavedUrlStore.instance) {
      SavedUrlStore.instance = new SavedUrlStore();
    }
    return SavedUrlStore.instance;
  }

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !("indexedDB" in window)) {
        reject(new Error("IndexedDB not available"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("[SavedUrlStore] DB open error:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("[SavedUrlStore] DB opened");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Keep the existing cached-tracks store intact
        if (!db.objectStoreNames.contains("cached-tracks")) {
          const store = db.createObjectStore("cached-tracks", { keyPath: "videoId" });
          store.createIndex("cachedAt", "cachedAt", { unique: false });
          store.createIndex("lastPlayedAt", "lastPlayedAt", { unique: false });
          store.createIndex("isManualDownload", "isManualDownload", { unique: false });
          store.createIndex("artist", "artist", { unique: false });
        }

        // New store for saved URLs
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const urlStore = db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
          urlStore.createIndex("savedAt", "savedAt", { unique: false });
          urlStore.createIndex("expiresAt", "expiresAt", { unique: false });
          console.log("[SavedUrlStore] Object store created");
        }
      };
    });

    return this.initPromise;
  }

  private async getDb(): Promise<IDBDatabase> {
    await this.init();
    if (!this.db) throw new Error("DB not initialized");
    return this.db;
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

  /**
   * Check if a saved URL is still valid (not expired).
   * Returns the URL if valid, null if expired or not found.
   */
  isValid(entry: SavedUrl): boolean {
    if (!entry.expiresAt) return true; // unknown expiry — assume valid
    return Date.now() < entry.expiresAt - EXPIRY_BUFFER_MS;
  }

  /**
   * Get a valid URL for a videoId, or null if expired/missing.
   */
  async getValidUrl(videoId: string): Promise<string | null> {
    const entry = await this.get(videoId);
    if (!entry) return null;
    if (!this.isValid(entry)) {
      console.log(`[SavedUrlStore] URL expired for ${videoId}`);
      return null;
    }
    return entry.url;
  }

  /** Create a SavedUrl from a track + resolved URL data */
  static createEntry(
    track: Track,
    url: string,
    expiresAt: number
  ): SavedUrl {
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
