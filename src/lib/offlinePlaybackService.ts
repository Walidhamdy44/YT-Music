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

const AUDIO_API_BASE = '/api/audio';       // streaming — for playback
const DOWNLOAD_API_BASE = '/api/audio';    // same streaming endpoint for download — no server buffering

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
   * Download track for offline (manual download).
   * Uses /api/download which buffers the full audio server-side and returns
   * an exact Content-Length — allowing real progress tracking via stream reader.
   */
  async downloadForOffline(track: Track, onProgress?: (progress: number) => void): Promise<boolean> {
    await this.init();

    console.log(`[OfflinePlayback] downloadForOffline: ${track.videoId} — ${track.title}`);

    // Already cached?
    const alreadyCached = await audioCache.isAudioCached(track.videoId);
    if (alreadyCached) {
      console.log(`[OfflinePlayback] Already cached: ${track.videoId}`);
      const metadata = await cacheMetadataStore.getMetadata(track.videoId);
      if (metadata && !metadata.isManualDownload) {
        metadata.isManualDownload = true;
        await cacheMetadataStore.saveMetadata(metadata);
      }
      onProgress?.(100);
      return true;
    }

    if (!this.isOnline()) {
      console.warn('[OfflinePlayback] Offline — cannot download');
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[OfflinePlayback] Download timeout, aborting');
      controller.abort();
    }, 5 * 60 * 1000);

    try {
      onProgress?.(5);

      // Use the buffered download endpoint — it returns Content-Length reliably
      const url = `${DOWNLOAD_API_BASE}/${track.videoId}`;
      console.log(`[OfflinePlayback] Fetching: ${url}`);

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentLength = response.headers.get('Content-Length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      const contentType = response.headers.get('Content-Type') || 'audio/webm';

      console.log(`[OfflinePlayback] Content-Length: ${totalBytes}, type: ${contentType}`);

      onProgress?.(10);

      // Stream with progress if we know the total size
      let audioBlob: Blob;

      if (totalBytes > 0 && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          // 10 → 88 % while downloading
          onProgress?.(Math.round(10 + (received / totalBytes) * 78));
        }

        // Reassemble
        const combined = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
        audioBlob = new Blob([combined], { type: contentType });
        console.log(`[OfflinePlayback] Downloaded ${audioBlob.size} bytes`);
      } else {
        // Fallback when Content-Length is missing
        console.warn('[OfflinePlayback] No Content-Length, using response.blob()');
        onProgress?.(50);
        audioBlob = await response.blob();
        console.log(`[OfflinePlayback] Downloaded ${audioBlob.size} bytes (blob fallback)`);
      }

      clearTimeout(timeoutId);

      if (audioBlob.size < 1000) {
        console.error(`[OfflinePlayback] Blob too small (${audioBlob.size}B) — likely an error page`);
        return false;
      }

      onProgress?.(90);

      // Make sure there is enough storage
      const hasSpace = await storageManager.ensureSpace(audioBlob.size);
      if (!hasSpace) {
        console.warn('[OfflinePlayback] Not enough storage');
        return false;
      }

      // Write to Cache API
      const cached = await audioCache.cacheAudio(track.videoId, audioBlob);
      if (!cached) {
        console.error('[OfflinePlayback] audioCache.cacheAudio failed');
        return false;
      }

      // Persist metadata
      const metadata = CacheMetadataStore.createMetadata(track, audioBlob.size, true);
      await cacheMetadataStore.saveMetadata(metadata);

      onProgress?.(100);
      console.log(`[OfflinePlayback] ✅ Saved: ${track.title} (${(audioBlob.size / 1024 / 1024).toFixed(2)} MB)`);
      return true;

    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        console.error('[OfflinePlayback] Aborted (timeout)');
      } else {
        console.error('[OfflinePlayback] Download error:', e);
      }
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
