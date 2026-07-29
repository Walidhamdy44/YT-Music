/**
 * Hook to get cache status for a specific track
 */

import { useOfflineStore } from '@/stores/offlineStore';

export interface CacheStatus {
  isCached: boolean;
  isDownloading: boolean;
  progress: number;
  isManualDownload?: boolean;
  fileSize?: number;
  cachedAt?: number;
  error?: string;
}

export function useCacheStatus(videoId: string): CacheStatus {
  const cachedTracks = useOfflineStore((state) => state.cachedTracks);
  const downloadQueue = useOfflineStore((state) => state.downloadQueue);

  // Check if in download queue
  const downloadTask = downloadQueue.find((t) => t.videoId === videoId);
  
  if (downloadTask) {
    return {
      isCached: downloadTask.status === 'completed',
      isDownloading: downloadTask.status === 'downloading' || downloadTask.status === 'pending',
      progress: downloadTask.progress,
      error: downloadTask.error,
    };
  }

  // Check if cached
  const metadata = cachedTracks.get(videoId);
  
  if (metadata) {
    return {
      isCached: true,
      isDownloading: false,
      progress: 100,
      isManualDownload: metadata.isManualDownload,
      fileSize: metadata.fileSize,
      cachedAt: metadata.cachedAt,
    };
  }

  // Not cached, not downloading
  return {
    isCached: false,
    isDownloading: false,
    progress: 0,
  };
}

/**
 * Check if multiple tracks are cached
 */
export function useBatchCacheStatus(videoIds: string[]): Map<string, boolean> {
  const cachedTracks = useOfflineStore((state) => state.cachedTracks);
  
  const result = new Map<string, boolean>();
  for (const videoId of videoIds) {
    result.set(videoId, cachedTracks.has(videoId));
  }
  
  return result;
}
