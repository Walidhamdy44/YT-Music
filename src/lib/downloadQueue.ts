/**
 * DownloadQueue - Manages background downloads with retry logic
 */

import { useOfflineStore } from "@/stores/offlineStore";
import { offlinePlaybackService } from "./offlinePlaybackService";
import { CacheMetadataStore } from "./cacheMetadataStore";
import type { Track } from "@/types";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 5000]; // Exponential backoff

class DownloadQueue {
  private static instance: DownloadQueue;
  private isProcessing = false;
  private abortControllers: Map<string, AbortController> = new Map();

  private constructor() {}

  static getInstance(): DownloadQueue {
    if (!DownloadQueue.instance) {
      DownloadQueue.instance = new DownloadQueue();
    }
    return DownloadQueue.instance;
  }

  /**
   * Add track to download queue
   */
  async addToQueue(track: Track): Promise<void> {
    const store = useOfflineStore.getState();
    
    // Check if already cached
    if (store.isTrackCached(track.videoId)) {
      console.log(`[DownloadQueue] Already cached: ${track.videoId}`);
      return;
    }

    // Check if already in queue
    const existingTask = store.getDownloadTask(track.videoId);
    if (existingTask && existingTask.status !== 'failed') {
      console.log(`[DownloadQueue] Already in queue: ${track.videoId}`);
      return;
    }

    // Add to queue
    store.addToDownloadQueue({
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
    });

    // Start processing if not already
    this.processQueue();
  }

  /**
   * Process the download queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const store = useOfflineStore.getState();
    
    while (true) {
      // Find next pending task
      const task = store.downloadQueue.find(
        (t) => t.status === 'pending' || t.status === 'failed' && t.retryCount < MAX_RETRIES
      );

      if (!task) {
        break;
      }

      await this.downloadTrack(task.videoId);
    }

    this.isProcessing = false;
  }

  /**
   * Download a single track
   */
  private async downloadTrack(videoId: string): Promise<void> {
    const store = useOfflineStore.getState();
    const task = store.getDownloadTask(videoId);
    
    if (!task) return;

    // Create abort controller for this download
    const abortController = new AbortController();
    this.abortControllers.set(videoId, abortController);

    try {
      store.updateDownloadStatus(videoId, 'downloading');
      store.updateDownloadProgress(videoId, 5);

      const response = await fetch(`/api/audio/${videoId}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      store.updateDownloadProgress(videoId, 20);

      // Get blob directly (simpler, works with streaming responses)
      const audioBlob = await response.blob();

      store.updateDownloadProgress(videoId, 80);

      // Create track object for caching
      const track: Track = {
        id: videoId,
        videoId,
        title: task.title,
        artist: task.artist,
        duration: 0,
        thumbnail: task.thumbnail,
      };

      const success = await offlinePlaybackService.cachePlayedAudio(track, audioBlob);

      if (success) {
        store.updateDownloadProgress(videoId, 100);
        store.updateDownloadStatus(videoId, 'completed');
        
        // Add to cached tracks in store
        const metadata = CacheMetadataStore.createMetadata(track, audioBlob.size, true);
        store.addCachedTrack(metadata);

        // Remove from queue after short delay
        setTimeout(() => {
          store.removeFromDownloadQueue(videoId);
        }, 2000);

        console.log(`[DownloadQueue] Download complete: ${task.title}`);
      } else {
        throw new Error('Failed to cache');
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log(`[DownloadQueue] Download cancelled: ${videoId}`);
        store.removeFromDownloadQueue(videoId);
        return;
      }

      console.error(`[DownloadQueue] Download failed: ${videoId}`, error);
      
      const currentTask = store.getDownloadTask(videoId);
      if (currentTask && currentTask.retryCount < MAX_RETRIES) {
        store.incrementRetryCount(videoId);
        store.updateDownloadStatus(videoId, 'pending', String(error));
        
        // Wait before retry
        const delay = RETRY_DELAYS[currentTask.retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        store.updateDownloadStatus(videoId, 'failed', String(error));
      }
    } finally {
      this.abortControllers.delete(videoId);
    }
  }

  /**
   * Cancel a download
   */
  cancelDownload(videoId: string): void {
    const controller = this.abortControllers.get(videoId);
    if (controller) {
      controller.abort();
    }
    useOfflineStore.getState().removeFromDownloadQueue(videoId);
  }

  /**
   * Cancel all downloads
   */
  cancelAll(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    useOfflineStore.getState().clearDownloadQueue();
  }

  /**
   * Get download status for a track
   */
  getDownloadStatus(videoId: string) {
    return useOfflineStore.getState().getDownloadTask(videoId);
  }
}

// Export singleton
export const downloadQueue = DownloadQueue.getInstance();
export { DownloadQueue };
