/**
 * AudioCacheManager - Manages audio file storage using the Cache API
 * 
 * Stores complete audio files for offline playback.
 * Each audio file is stored with videoId as the key.
 */

const CACHE_NAME = 'yt-music-audio-v1';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB max per file

class AudioCacheManager {
  private static instance: AudioCacheManager;
  private cachePromise: Promise<Cache> | null = null;

  private constructor() {}

  static getInstance(): AudioCacheManager {
    if (!AudioCacheManager.instance) {
      AudioCacheManager.instance = new AudioCacheManager();
    }
    return AudioCacheManager.instance;
  }

  /**
   * Get or open the cache
   */
  private async getCache(): Promise<Cache> {
    if (typeof window === 'undefined' || !('caches' in window)) {
      throw new Error('Cache API not available');
    }
    
    if (!this.cachePromise) {
      this.cachePromise = caches.open(CACHE_NAME);
    }
    return this.cachePromise;
  }

  /**
   * Generate cache key for a video — must be an absolute URL for iOS Safari.
   */
  private getCacheKey(videoId: string): string {
    // Use absolute URL so iOS Safari's Cache API accepts it
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/offline-audio/${videoId}`;
  }

  /**
   * Store audio blob in cache.
   * Uses a full absolute URL as the cache key — required for iOS Safari PWA.
   */
  async cacheAudio(videoId: string, audioBlob: Blob): Promise<boolean> {
    try {
      if (audioBlob.size > MAX_FILE_SIZE) {
        console.warn(`[AudioCache] File too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB), skipping ${videoId}`);
        return false;
      }

      const cache = await this.getCache();
      const cacheKey = this.getCacheKey(videoId);

      // iOS Safari requires an explicit Response with status 200 and
      // a real URL-based Request — plain path strings fail silently.
      const request = new Request(cacheKey, { method: 'GET' });
      const response = new Response(audioBlob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': audioBlob.type || 'audio/webm',
          'Content-Length': audioBlob.size.toString(),
          'X-Cached-At': Date.now().toString(),
        },
      });

      await cache.put(request, response);
      console.log(`[AudioCache] Cached ${videoId} (${(audioBlob.size / 1024 / 1024).toFixed(2)}MB)`);
      return true;
    } catch (error) {
      console.error(`[AudioCache] Failed to cache ${videoId}:`, error);
      return false;
    }
  }

  /**
   * Get cached audio as a blob URL
   * @returns blob URL if cached, null otherwise
   */
  async getCachedAudio(videoId: string): Promise<string | null> {
    try {
      const cache = await this.getCache();
      const cacheKey = this.getCacheKey(videoId);
      const response = await cache.match(cacheKey);

      if (!response) {
        return null;
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return blobUrl;
    } catch (error) {
      console.error(`[AudioCache] Failed to get cached audio for ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Get cached audio as a Blob (for direct access)
   */
  async getCachedAudioBlob(videoId: string): Promise<Blob | null> {
    try {
      const cache = await this.getCache();
      const cacheKey = this.getCacheKey(videoId);
      const response = await cache.match(cacheKey);

      if (!response) {
        return null;
      }

      return await response.blob();
    } catch (error) {
      console.error(`[AudioCache] Failed to get cached blob for ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Check if audio is cached (quick check without loading the file)
   */
  async isAudioCached(videoId: string): Promise<boolean> {
    try {
      const cache = await this.getCache();
      const cacheKey = this.getCacheKey(videoId);
      const response = await cache.match(cacheKey);
      return response !== undefined;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete cached audio for a video
   */
  async deleteAudio(videoId: string): Promise<boolean> {
    try {
      const cache = await this.getCache();
      const cacheKey = this.getCacheKey(videoId);
      const deleted = await cache.delete(cacheKey);
      if (deleted) {
        console.log(`[AudioCache] Deleted ${videoId}`);
      }
      return deleted;
    } catch (error) {
      console.error(`[AudioCache] Failed to delete ${videoId}:`, error);
      return false;
    }
  }

  /**
   * Clear all cached audio files
   */
  async clearAllCache(): Promise<void> {
    try {
      await caches.delete(CACHE_NAME);
      this.cachePromise = null; // Reset cache promise
      console.log('[AudioCache] All cache cleared');
    } catch (error) {
      console.error('[AudioCache] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Get list of all cached video IDs
   */
  async getCachedVideoIds(): Promise<string[]> {
    try {
      const cache = await this.getCache();
      const keys = await cache.keys();
      
      return keys
        .map(request => {
          try {
            const url = new URL(request.url);
            const match = url.pathname.match(/\/offline-audio\/([a-zA-Z0-9_-]{11})/);
            return match ? match[1] : null;
          } catch {
            return null;
          }
        })
        .filter((id): id is string => id !== null);
    } catch (error) {
      console.error('[AudioCache] Failed to get cached video IDs:', error);
      return [];
    }
  }

  /**
   * Get total size of all cached audio files
   */
  async getCacheSize(): Promise<number> {
    try {
      const cache = await this.getCache();
      const keys = await cache.keys();
      
      let totalSize = 0;
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('[AudioCache] Failed to calculate cache size:', error);
      return 0;
    }
  }

  /**
   * Get info about a cached file
   */
  async getCacheInfo(videoId: string): Promise<{ size: number; cachedAt: number } | null> {
    try {
      const cache = await this.getCache();
      const cacheKey = this.getCacheKey(videoId);
      const response = await cache.match(cacheKey);

      if (!response) {
        return null;
      }

      const blob = await response.blob();
      const cachedAt = parseInt(response.headers.get('X-Cached-At') || '0', 10);

      return {
        size: blob.size,
        cachedAt: cachedAt || Date.now(),
      };
    } catch (error) {
      return null;
    }
  }
}

// Export singleton instance
export const audioCache = AudioCacheManager.getInstance();
export { AudioCacheManager };
