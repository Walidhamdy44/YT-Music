/**
 * OfflinePlaybackService - Coordinates between player and cache
 * 
 * Determines whether to play from cache or network,
 * and handles caching after successful playback.
 */

import { audioCache } from './audioCache';
import { cacheMetadataStore, CacheMetadataStore, type CachedTrackMetadata } from './cacheMetadataStore';
import { storageManager } from './storageManager';
import type { Track } from '@/types';

const AUDIO_API_BASE = '/api/audio';

export interface AudioSource {
  url: string;
  isFromCache: boolean;
  metadata?: CachedTrackMetadata;
}

class OfflinePlaybackService {
  private static instance: OfflinePlaybackService;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): OfflinePlaybackService {
    if (!OfflinePlaybackService.instance) {
      OfflinePlaybackService.instance = new OfflinePlaybackService();
    }
    return OfflinePlaybackService.instance;
  }

  /**
   * Initialize the offline playback system
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Initialize IndexedDB
        await cacheMetadataStore.init();
        
        // Validate cache integrity (clean up orphans)
        await storageManager.validateCacheIntegrity();
        
        // Request persistent storage
        await storageManager.requestPersistentStorage();
        
        this.initialized = true;
        console.log('[OfflinePlaybackService] Initialized');
      } catch (e) {
        console.error('[OfflinePlaybackService] Initialization failed:', e);
        // Don't throw - app can still work without offline features
      }
    })();

    return this.initPromise;
  }

  /**
   * Get audio URL for playback
   * Returns cached blob URL if available, otherwise network URL
   */
  async getAudioUrl(videoId: string): Promise<AudioSource> {
    await this.init();

    // Check if cached
    const cachedUrl = await audioCache.getCachedAudio(videoId);
    
    if (cachedUrl) {
      const metadata = await cacheMetadataStore.getMetadata(videoId);
      console.log(`[OfflinePlayback] Playing from cache: ${videoId}`);
      
      // Update last played time
      await cacheMetadataStore.updateLastPlayed(videoId);
      
      return {
        url: cachedUrl,
        isFromCache: true,
        metadata: metadata || undefined,
      };
    }

    // Not cached - return network URL
    console.log(`[OfflinePlayback] Playing from network: ${videoId}`);
    return {
      url: `${AUDIO_API_BASE}/${videoId}`,
      isFromCache: false,
    };
  }

  /**
   * Check if a track can be played offline
   */
  async canPlayOffline(videoId: string): Promise<boolean> {
    return await audioCache.isAudioCached(videoId);
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  /**
   * Cache audio after successful playback
   * Called automatically when a song finishes streaming
   */
  async cachePlayedAudio(track: Track, audioBlob: Blob): Promise<boolean> {
    await this.init();

    // Skip if already cached
    const alreadyCached = await audioCache.isAudioCached(track.videoId);
    if (alreadyCached) {
      console.log(`[OfflinePlayback] Already cached: ${track.videoId}`);
      return true;
    }

    // Check if we have space (or can make space)
    const hasSpace = await storageManager.ensureSpace(audioBlob.size);
    if (!hasSpace) {
      console.warn(`[OfflinePlayback] Not enough storage to cache ${track.videoId}`);
      return false;
    }

    // Cache the audio file
    const cached = await audioCache.cacheAudio(track.videoId, audioBlob);
    if (!cached) {
      return false;
    }

    // Save metadata
    const metadata = CacheMetadataStore.createMetadata(track, audioBlob.size, false);
    await cacheMetadataStore.saveMetadata(metadata);

    console.log(`[OfflinePlayback] Cached: ${track.title} (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB)`);
    return true;
  }

  /**
   * Download track for offline (manual download)
   * Unlike auto-caching, this is user-initiated
   */
  async downloadForOffline(track: Track, onProgress?: (progress: number) => void): Promise<boolean> {
    await this.init();

    // Skip if already cached
    const alreadyCached = await audioCache.isAudioCached(track.videoId);
    if (alreadyCached) {
      // Update to manual download status if it was auto-cached
      const metadata = await cacheMetadataStore.getMetadata(track.videoId);
      if (metadata && !metadata.isManualDownload) {
        metadata.isManualDownload = true;
        await cacheMetadataStore.saveMetadata(metadata);
      }
      onProgress?.(100);
      return true;
    }

    // Check if online
    if (!this.isOnline()) {
      console.warn('[OfflinePlayback] Cannot download while offline');
      return false;
    }

    try {
      onProgress?.(5); // Show some initial progress

      // Fetch the audio as a blob directly (simpler and works with streaming)
      const response = await fetch(`${AUDIO_API_BASE}/${track.videoId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      onProgress?.(20); // Fetching started

      // Get the blob directly - this waits for the full download
      const audioBlob = await response.blob();
      
      onProgress?.(80); // Download complete, now caching

      // Ensure we have space
      const hasSpace = await storageManager.ensureSpace(audioBlob.size);
      if (!hasSpace) {
        console.warn('[OfflinePlayback] Not enough storage for manual download');
        return false;
      }

      // Cache the audio
      const cached = await audioCache.cacheAudio(track.videoId, audioBlob);
      if (!cached) {
        return false;
      }

      // Save metadata (mark as manual download)
      const metadata = CacheMetadataStore.createMetadata(track, audioBlob.size, true);
      await cacheMetadataStore.saveMetadata(metadata);

      onProgress?.(100);
      console.log(`[OfflinePlayback] Downloaded: ${track.title} (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB)`);
      return true;
    } catch (e) {
      console.error(`[OfflinePlayback] Download failed for ${track.videoId}:`, e);
      return false;
    }
  }

  /**
   * Remove a track from cache
   */
  async removeFromCache(videoId: string): Promise<boolean> {
    return await storageManager.deleteTrack(videoId);
  }

  /**
   * Get all cached tracks
   */
  async getCachedTracks(): Promise<CachedTrackMetadata[]> {
    await this.init();
    return await cacheMetadataStore.getAllMetadata();
  }

  /**
   * Get cache status for a track
   */
  async getCacheStatus(videoId: string): Promise<{
    isCached: boolean;
    isManualDownload?: boolean;
    fileSize?: number;
    cachedAt?: number;
  }> {
    const metadata = await cacheMetadataStore.getMetadata(videoId);
    
    if (!metadata) {
      return { isCached: false };
    }

    return {
      isCached: true,
      isManualDownload: metadata.isManualDownload,
      fileSize: metadata.fileSize,
      cachedAt: metadata.cachedAt,
    };
  }

  /**
   * Revoke a blob URL (call when done with cached audio)
   */
  revokeBlobUrl(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}

// Export singleton instance
export const offlinePlaybackService = OfflinePlaybackService.getInstance();
export { OfflinePlaybackService };
