/**
 * StorageManager - Handles storage quota monitoring and cache eviction
 *
 * Uses navigator.storage.estimate() for the real device quota.
 * No hard-coded size limits — the actual device quota is the ceiling.
 * Manual downloads are NEVER deleted by eviction.
 */

import { audioCache } from './audioCache';
import { cacheMetadataStore } from './cacheMetadataStore';

// Small safety buffer so we don't fill the quota to the last byte
const SAFETY_BUFFER = 2 * 1024 * 1024; // 2 MB
// Warn when less than this is free
const WARNING_THRESHOLD = 20 * 1024 * 1024; // 20 MB

export interface StorageStats {
  used: number;        // bytes used by our cache (from IndexedDB metadata)
  quota: number;       // total quota reported by browser (0 = unknown)
  available: number;   // free space (quota - browser total usage), Infinity if unknown
  cachedCount: number; // number of cached tracks
}

class StorageManager {
  private static instance: StorageManager;

  private constructor() {}

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * Get current storage statistics using the real browser quota.
   */
  async getStorageStats(): Promise<StorageStats> {
    let quota = 0;
    let totalUsed = 0;

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota || 0;
        totalUsed = estimate.usage || 0;
      } catch (e) {
        console.warn('[StorageManager] estimate() failed:', e);
      }
    }

    const cacheUsed = await cacheMetadataStore.getTotalSize();
    const cachedCount = await cacheMetadataStore.getCount();
    const available = quota > 0 ? quota - totalUsed : Infinity;

    return { used: cacheUsed, quota, available, cachedCount };
  }

  /**
   * Returns true when the device has enough free space for fileSize bytes.
   * If the quota is unknown (quota === 0) we optimistically allow it.
   */
  async canCache(fileSize: number): Promise<boolean> {
    const stats = await this.getStorageStats();
    if (stats.quota === 0) return true; // unknown — let the Cache API decide
    return stats.available > fileSize + SAFETY_BUFFER;
  }

  /**
   * Evict ONLY auto-cached (non-manual) tracks, oldest first, until
   * requiredSpace bytes are freed.  Manual downloads are never touched.
   * Returns the number of bytes actually freed.
   */
  async evictAutoCache(requiredSpace: number): Promise<number> {
    console.log(`[StorageManager] Evicting auto-cache to free ${(requiredSpace / 1024 / 1024).toFixed(1)} MB`);

    const autoCached = await cacheMetadataStore.getAutoCachedTracks(); // sorted oldest-first
    let freed = 0;

    for (const track of autoCached) {
      if (freed >= requiredSpace) break;
      const ok = await this.deleteTrack(track.videoId);
      if (ok) {
        freed += track.fileSize;
        console.log(`[StorageManager] Evicted: ${track.title} (${(track.fileSize / 1024 / 1024).toFixed(1)} MB)`);
      }
    }

    console.log(`[StorageManager] Freed ${(freed / 1024 / 1024).toFixed(1)} MB`);
    return freed;
  }

  /**
   * @deprecated use evictAutoCache — kept for backwards compatibility
   */
  async evictToFreeSpace(requiredSpace: number): Promise<number> {
    return this.evictAutoCache(requiredSpace);
  }

  /**
   * Delete a track from both cache and metadata
   */
  async deleteTrack(videoId: string): Promise<boolean> {
    try {
      await audioCache.deleteAudio(videoId);
      await cacheMetadataStore.deleteMetadata(videoId);
      return true;
    } catch (e) {
      console.error(`[StorageManager] Failed to delete track ${videoId}:`, e);
      return false;
    }
  }

  /**
   * Delete multiple tracks
   */
  async deleteTracks(videoIds: string[]): Promise<{ deleted: number; freedSpace: number }> {
    let deleted = 0;
    let freedSpace = 0;

    for (const videoId of videoIds) {
      const metadata = await cacheMetadataStore.getMetadata(videoId);
      if (metadata) {
        const success = await this.deleteTrack(videoId);
        if (success) {
          deleted++;
          freedSpace += metadata.fileSize;
        }
      }
    }

    return { deleted, freedSpace };
  }

  /**
   * Clear all cached audio and metadata
   */
  async clearAllCache(): Promise<{ deleted: number; freedSpace: number }> {
    const stats = await this.getStorageStats();
    const count = stats.cachedCount;
    const size = stats.used;

    await audioCache.clearAllCache();
    await cacheMetadataStore.clearAll();

    return { deleted: count, freedSpace: size };
  }

  /**
   * Request persistent storage from the browser.
   * On iOS Safari this may not be supported but we try anyway.
   */
  async requestPersistentStorage(): Promise<boolean> {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) {
      console.warn('[StorageManager] Persistent storage API not supported');
      return false;
    }

    try {
      const persisted = await navigator.storage.persisted();
      if (persisted) {
        console.log('[StorageManager] Storage already persistent');
        return true;
      }
      const granted = await navigator.storage.persist();
      console.log(`[StorageManager] Persistent storage ${granted ? 'granted' : 'denied (will use best-effort)'}`);
      return granted;
    } catch (e) {
      console.warn('[StorageManager] persist() failed:', e);
      return false;
    }
  }

  /**
   * Check if persistent storage is enabled
   */
  async isPersistent(): Promise<boolean> {
    if (!('storage' in navigator) || !('persisted' in navigator.storage)) {
      return false;
    }

    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }

  /**
   * Check if storage is low (less than WARNING_THRESHOLD free)
   */
  async isStorageLow(): Promise<boolean> {
    const stats = await this.getStorageStats();
    if (stats.quota === 0) return false;
    return stats.available < WARNING_THRESHOLD;
  }

  /**
   * Check if storage is critically low (less than SAFETY_BUFFER free)
   */
  async isStorageCritical(): Promise<boolean> {
    const stats = await this.getStorageStats();
    if (stats.quota === 0) return false;
    return stats.available < SAFETY_BUFFER;
  }

  /**
   * Ensure there is space for a manual download.
   * Evicts ONLY auto-cached tracks to make room.
   * Returns true if space is available after eviction, false if still not enough
   * (meaning the user's manual downloads fill the quota — they must delete some).
   */
  async ensureSpace(requiredSize: number): Promise<boolean> {
    if (await this.canCache(requiredSize)) return true;

    // Try evicting auto-cache only
    const stats = await this.getStorageStats();
    const needed = requiredSize + SAFETY_BUFFER - stats.available;
    if (needed > 0) {
      await this.evictAutoCache(needed);
    }

    return this.canCache(requiredSize);
  }

  /**
   * Validate cache integrity - remove orphan entries
   * (metadata without audio, audio without metadata)
   */
  async validateCacheIntegrity(): Promise<{ orphanMetadata: number; orphanAudio: number }> {
    let orphanMetadata = 0;
    let orphanAudio = 0;

    // Get all metadata entries
    const allMetadata = await cacheMetadataStore.getAllMetadata();
    
    // Get all cached audio IDs
    const cachedAudioIds = await audioCache.getCachedVideoIds();
    const cachedAudioSet = new Set(cachedAudioIds);

    // Check for metadata without audio
    for (const metadata of allMetadata) {
      if (!cachedAudioSet.has(metadata.videoId)) {
        console.log(`[StorageManager] Removing orphan metadata: ${metadata.videoId}`);
        await cacheMetadataStore.deleteMetadata(metadata.videoId);
        orphanMetadata++;
      }
    }

    // Check for audio without metadata
    const metadataIds = new Set(allMetadata.map(m => m.videoId));
    for (const audioId of cachedAudioIds) {
      if (!metadataIds.has(audioId)) {
        console.log(`[StorageManager] Removing orphan audio: ${audioId}`);
        await audioCache.deleteAudio(audioId);
        orphanAudio++;
      }
    }

    if (orphanMetadata > 0 || orphanAudio > 0) {
      console.log(`[StorageManager] Cache validation complete. Removed ${orphanMetadata} orphan metadata, ${orphanAudio} orphan audio`);
    }

    return { orphanMetadata, orphanAudio };
  }

  /**
   * Format bytes to human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const storageManager = StorageManager.getInstance();
export { StorageManager, WARNING_THRESHOLD };
