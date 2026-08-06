/**
 * StorageManager - Handles storage quota monitoring and cache eviction
 * 
 * Monitors available storage, triggers eviction when needed,
 * and requests persistent storage permission.
 */

import { audioCache } from './audioCache';
import { cacheMetadataStore, type CachedTrackMetadata } from './cacheMetadataStore';

const MIN_FREE_SPACE = 5 * 1024 * 1024;      // 5MB buffer (was 100MB — too large for iOS 50MB quota)
const WARNING_THRESHOLD = 10 * 1024 * 1024;  // 10MB warning (was 200MB)

export interface StorageStats {
  used: number;       // Bytes used by our cache
  quota: number;      // Total quota available
  available: number;  // Free space
  cachedCount: number; // Number of cached tracks
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
   * Get current storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    let quota = 0;
    let totalUsed = 0;

    // Try to get storage estimate
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota || 0;
        totalUsed = estimate.usage || 0;
      } catch (e) {
        console.warn('[StorageManager] Failed to get storage estimate:', e);
      }
    }

    // Get our cache size
    const cacheUsed = await cacheMetadataStore.getTotalSize();
    const cachedCount = await cacheMetadataStore.getCount();

    // Calculate available space
    const available = quota > 0 ? quota - totalUsed : Infinity;

    return {
      used: cacheUsed,
      quota,
      available,
      cachedCount,
    };
  }

  /**
   * Check if we can cache a file of the given size
   */
  async canCache(fileSize: number): Promise<boolean> {
    const stats = await this.getStorageStats();
    
    // If we can't determine quota, allow caching (will fail naturally if no space)
    if (stats.quota === 0) {
      return true;
    }

    // Check if we have enough space (keeping MIN_FREE_SPACE buffer)
    return stats.available > fileSize + MIN_FREE_SPACE;
  }

  /**
   * Evict tracks to free up required space
   * Returns the number of bytes freed
   * 
   * Eviction priority:
   * 1. Auto-cached tracks (least recently played first)
   * 2. Manual downloads (least recently played first)
   */
  async evictToFreeSpace(requiredSpace: number): Promise<number> {
    console.log(`[StorageManager] Evicting to free ${(requiredSpace / 1024 / 1024).toFixed(1)}MB`);
    
    let freedSpace = 0;
    const evictedIds: string[] = [];

    // First, try to evict auto-cached tracks
    const autoCached = await cacheMetadataStore.getAutoCachedTracks();
    
    for (const track of autoCached) {
      if (freedSpace >= requiredSpace) break;
      
      const deleted = await this.deleteTrack(track.videoId);
      if (deleted) {
        freedSpace += track.fileSize;
        evictedIds.push(track.videoId);
        console.log(`[StorageManager] Evicted auto-cached: ${track.title} (${(track.fileSize / 1024 / 1024).toFixed(1)}MB)`);
      }
    }

    // If still need more space, evict manual downloads
    if (freedSpace < requiredSpace) {
      const allTracks = await cacheMetadataStore.getTracksByLastPlayed();
      const manualDownloads = allTracks.filter(t => t.isManualDownload);
      
      for (const track of manualDownloads) {
        if (freedSpace >= requiredSpace) break;
        
        const deleted = await this.deleteTrack(track.videoId);
        if (deleted) {
          freedSpace += track.fileSize;
          evictedIds.push(track.videoId);
          console.log(`[StorageManager] Evicted manual download: ${track.title} (${(track.fileSize / 1024 / 1024).toFixed(1)}MB)`);
        }
      }
    }

    console.log(`[StorageManager] Eviction complete. Freed ${(freedSpace / 1024 / 1024).toFixed(1)}MB from ${evictedIds.length} tracks`);
    return freedSpace;
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
   * Check if storage is low (below warning threshold)
   */
  async isStorageLow(): Promise<boolean> {
    const stats = await this.getStorageStats();
    
    // If quota is 0, we can't determine (probably not supported)
    if (stats.quota === 0) {
      return false;
    }

    return stats.available < WARNING_THRESHOLD;
  }

  /**
   * Check if storage is critical (below minimum threshold)
   */
  async isStorageCritical(): Promise<boolean> {
    const stats = await this.getStorageStats();
    
    if (stats.quota === 0) {
      return false;
    }

    return stats.available < MIN_FREE_SPACE;
  }

  /**
   * Ensure there's enough space to cache a file, evicting if necessary
   * Returns true if space is available (or was freed), false if impossible
   */
  async ensureSpace(requiredSize: number): Promise<boolean> {
    // Check current space
    if (await this.canCache(requiredSize)) {
      return true;
    }

    // Try to evict to make space
    const stats = await this.getStorageStats();
    const neededSpace = requiredSize + MIN_FREE_SPACE - stats.available;
    
    if (neededSpace > 0) {
      const freed = await this.evictToFreeSpace(neededSpace);
      
      // Check if we freed enough
      return freed >= neededSpace;
    }

    return false;
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
export { StorageManager, MIN_FREE_SPACE, WARNING_THRESHOLD };
