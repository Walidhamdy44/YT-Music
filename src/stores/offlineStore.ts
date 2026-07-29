/**
 * Offline Store - Zustand store for offline playback state
 */

import { create } from 'zustand';
import type { CachedTrackMetadata } from '@/lib/cacheMetadataStore';

export interface DownloadTask {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  progress: number;         // 0-100
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
}

interface OfflineState {
  // State
  isOffline: boolean;
  cachedTracks: Map<string, CachedTrackMetadata>;
  downloadQueue: DownloadTask[];
  storageUsed: number;      // Bytes
  storageQuota: number;     // Bytes
  isInitialized: boolean;

  // Actions
  setOffline: (offline: boolean) => void;
  setCachedTracks: (tracks: CachedTrackMetadata[]) => void;
  addCachedTrack: (metadata: CachedTrackMetadata) => void;
  removeCachedTrack: (videoId: string) => void;
  updateCachedTrack: (videoId: string, updates: Partial<CachedTrackMetadata>) => void;
  
  // Download queue actions
  addToDownloadQueue: (task: Omit<DownloadTask, 'progress' | 'status' | 'retryCount'>) => void;
  updateDownloadProgress: (videoId: string, progress: number) => void;
  updateDownloadStatus: (videoId: string, status: DownloadTask['status'], error?: string) => void;
  removeFromDownloadQueue: (videoId: string) => void;
  incrementRetryCount: (videoId: string) => void;
  clearDownloadQueue: () => void;
  
  // Storage actions
  updateStorageStats: (used: number, quota: number) => void;
  setInitialized: (initialized: boolean) => void;
  
  // Helpers
  isTrackCached: (videoId: string) => boolean;
  getDownloadTask: (videoId: string) => DownloadTask | undefined;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  // Initial state
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  cachedTracks: new Map(),
  downloadQueue: [],
  storageUsed: 0,
  storageQuota: 0,
  isInitialized: false,

  // Actions
  setOffline: (offline) => set({ isOffline: offline }),

  setCachedTracks: (tracks) => {
    const map = new Map<string, CachedTrackMetadata>();
    tracks.forEach(track => map.set(track.videoId, track));
    set({ cachedTracks: map });
  },

  addCachedTrack: (metadata) => set((state) => {
    const newMap = new Map(state.cachedTracks);
    newMap.set(metadata.videoId, metadata);
    return { 
      cachedTracks: newMap,
      storageUsed: state.storageUsed + metadata.fileSize,
    };
  }),

  removeCachedTrack: (videoId) => set((state) => {
    const newMap = new Map(state.cachedTracks);
    const track = newMap.get(videoId);
    const sizeFreed = track?.fileSize || 0;
    newMap.delete(videoId);
    return { 
      cachedTracks: newMap,
      storageUsed: Math.max(0, state.storageUsed - sizeFreed),
    };
  }),

  updateCachedTrack: (videoId, updates) => set((state) => {
    const newMap = new Map(state.cachedTracks);
    const existing = newMap.get(videoId);
    if (existing) {
      newMap.set(videoId, { ...existing, ...updates });
    }
    return { cachedTracks: newMap };
  }),

  // Download queue actions
  addToDownloadQueue: (task) => set((state) => {
    // Don't add if already in queue
    if (state.downloadQueue.some(t => t.videoId === task.videoId)) {
      return state;
    }
    return {
      downloadQueue: [...state.downloadQueue, {
        ...task,
        progress: 0,
        status: 'pending',
        retryCount: 0,
      }],
    };
  }),

  updateDownloadProgress: (videoId, progress) => set((state) => ({
    downloadQueue: state.downloadQueue.map(task =>
      task.videoId === videoId
        ? { ...task, progress, status: 'downloading' as const }
        : task
    ),
  })),

  updateDownloadStatus: (videoId, status, error) => set((state) => ({
    downloadQueue: state.downloadQueue.map(task =>
      task.videoId === videoId
        ? { ...task, status, error }
        : task
    ),
  })),

  removeFromDownloadQueue: (videoId) => set((state) => ({
    downloadQueue: state.downloadQueue.filter(task => task.videoId !== videoId),
  })),

  incrementRetryCount: (videoId) => set((state) => ({
    downloadQueue: state.downloadQueue.map(task =>
      task.videoId === videoId
        ? { ...task, retryCount: task.retryCount + 1 }
        : task
    ),
  })),

  clearDownloadQueue: () => set({ downloadQueue: [] }),

  // Storage actions
  updateStorageStats: (used, quota) => set({ storageUsed: used, storageQuota: quota }),

  setInitialized: (initialized) => set({ isInitialized: initialized }),

  // Helpers
  isTrackCached: (videoId) => get().cachedTracks.has(videoId),

  getDownloadTask: (videoId) => get().downloadQueue.find(t => t.videoId === videoId),
}));
