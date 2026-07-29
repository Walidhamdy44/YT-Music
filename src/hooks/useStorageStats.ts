/**
 * Hook to get storage statistics
 */

import { useEffect, useState, useCallback } from 'react';
import { useOfflineStore } from '@/stores/offlineStore';
import { storageManager, StorageManager, WARNING_THRESHOLD } from '@/lib/storageManager';

export interface StorageStats {
  used: number;
  quota: number;
  available: number;
  cachedCount: number;
  usedFormatted: string;
  quotaFormatted: string;
  availableFormatted: string;
  percentUsed: number;
  isLow: boolean;
}

export function useStorageStats(): StorageStats {
  const storageUsed = useOfflineStore((state) => state.storageUsed);
  const storageQuota = useOfflineStore((state) => state.storageQuota);
  const cachedTracks = useOfflineStore((state) => state.cachedTracks);
  const updateStorageStats = useOfflineStore((state) => state.updateStorageStats);
  
  const [isLow, setIsLow] = useState(false);

  // Refresh stats periodically
  const refreshStats = useCallback(async () => {
    try {
      const stats = await storageManager.getStorageStats();
      updateStorageStats(stats.used, stats.quota);
      setIsLow(stats.available < WARNING_THRESHOLD);
    } catch (e) {
      console.warn('[useStorageStats] Failed to refresh:', e);
    }
  }, [updateStorageStats]);

  useEffect(() => {
    // Initial fetch
    refreshStats();

    // Refresh every 30 seconds
    const interval = setInterval(refreshStats, 30000);

    return () => clearInterval(interval);
  }, [refreshStats]);

  const cachedCount = cachedTracks.size;
  const available = Math.max(0, storageQuota - storageUsed);
  const percentUsed = storageQuota > 0 ? Math.round((storageUsed / storageQuota) * 100) : 0;

  return {
    used: storageUsed,
    quota: storageQuota,
    available,
    cachedCount,
    usedFormatted: StorageManager.formatBytes(storageUsed),
    quotaFormatted: StorageManager.formatBytes(storageQuota),
    availableFormatted: StorageManager.formatBytes(available),
    percentUsed,
    isLow,
  };
}

/**
 * Hook to manually refresh storage stats
 */
export function useRefreshStorageStats() {
  const updateStorageStats = useOfflineStore((state) => state.updateStorageStats);

  return useCallback(async () => {
    const stats = await storageManager.getStorageStats();
    updateStorageStats(stats.used, stats.quota);
    return stats;
  }, [updateStorageStats]);
}
