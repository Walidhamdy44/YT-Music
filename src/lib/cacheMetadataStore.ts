/**
 * CacheMetadataStore - IndexedDB wrapper for track metadata
 * 
 * Stores metadata about cached songs for quick lookup and management.
 * Uses videoId as the primary key.
 */

import type { Track } from '@/types';
import { getOfflineDb } from './offlineDb';

export interface CachedTrackMetadata {
  videoId: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  duration: number;
  thumbnail: string;
  thumbnailLarge?: string;
  fileSize: number;
  cachedAt: number;
  lastPlayedAt: number;
  isManualDownload: boolean;
  mimeType: string;
}

const STORE_NAME = 'cached-tracks';

class CacheMetadataStore {
  private static instance: CacheMetadataStore;

  private constructor() {}

  static getInstance(): CacheMetadataStore {
    if (!CacheMetadataStore.instance) {
      CacheMetadataStore.instance = new CacheMetadataStore();
    }
    return CacheMetadataStore.instance;
  }

  /** Initialize — just ensures the shared DB is open */
  async init(): Promise<void> {
    await getOfflineDb();
  }

  private async getDb(): Promise<IDBDatabase> {
    return getOfflineDb();
  }

  /**
   * Save track metadata
   */
  async saveMetadata(metadata: CachedTrackMetadata): Promise<void> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(metadata);

      request.onsuccess = () => {
        console.log(`[CacheMetadataStore] Saved metadata for ${metadata.videoId}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[CacheMetadataStore] Failed to save metadata for ${metadata.videoId}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get track metadata by videoId
   */
  async getMetadata(videoId: string): Promise<CachedTrackMetadata | null> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(videoId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Get all cached track metadata
   */
  async getAllMetadata(): Promise<CachedTrackMetadata[]> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Delete track metadata
   */
  async deleteMetadata(videoId: string): Promise<void> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(videoId);

      request.onsuccess = () => {
        console.log(`[CacheMetadataStore] Deleted metadata for ${videoId}`);
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Update last played timestamp
   */
  async updateLastPlayed(videoId: string): Promise<void> {
    const metadata = await this.getMetadata(videoId);
    if (metadata) {
      metadata.lastPlayedAt = Date.now();
      await this.saveMetadata(metadata);
    }
  }

  /**
   * Get tracks sorted by last played (oldest first) for LRU eviction
   */
  async getTracksByLastPlayed(): Promise<CachedTrackMetadata[]> {
    const all = await this.getAllMetadata();
    return all.sort((a, b) => a.lastPlayedAt - b.lastPlayedAt);
  }

  /**
   * Get tracks sorted by cache date (newest first)
   */
  async getTracksByCacheDate(): Promise<CachedTrackMetadata[]> {
    const all = await this.getAllMetadata();
    return all.sort((a, b) => b.cachedAt - a.cachedAt);
  }

  /**
   * Get only auto-cached tracks (for eviction priority)
   */
  async getAutoCachedTracks(): Promise<CachedTrackMetadata[]> {
    const all = await this.getAllMetadata();
    return all
      .filter(t => !t.isManualDownload)
      .sort((a, b) => a.lastPlayedAt - b.lastPlayedAt);
  }

  /**
   * Get total count of cached tracks
   */
  async getCount(): Promise<number> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Get total size of all cached tracks
   */
  async getTotalSize(): Promise<number> {
    const all = await this.getAllMetadata();
    return all.reduce((sum, track) => sum + track.fileSize, 0);
  }

  /**
   * Clear all metadata
   */
  async clearAll(): Promise<void> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[CacheMetadataStore] All metadata cleared');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Search tracks by title or artist
   */
  async searchTracks(query: string): Promise<CachedTrackMetadata[]> {
    const all = await this.getAllMetadata();
    const lowerQuery = query.toLowerCase();
    
    return all.filter(track => 
      track.title.toLowerCase().includes(lowerQuery) ||
      track.artist.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Check if track is cached
   */
  async isTrackCached(videoId: string): Promise<boolean> {
    const metadata = await this.getMetadata(videoId);
    return metadata !== null;
  }

  /**
   * Create metadata from Track object
   */
  static createMetadata(track: Track, fileSize: number, isManualDownload: boolean): CachedTrackMetadata {
    const now = Date.now();
    return {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      album: track.album,
      albumId: track.albumId,
      duration: track.duration,
      thumbnail: track.thumbnail,
      thumbnailLarge: track.thumbnailLarge,
      fileSize,
      cachedAt: now,
      lastPlayedAt: now,
      isManualDownload,
      mimeType: 'audio/mp4',
    };
  }
}

// Export singleton instance
export const cacheMetadataStore = CacheMetadataStore.getInstance();
export { CacheMetadataStore };
