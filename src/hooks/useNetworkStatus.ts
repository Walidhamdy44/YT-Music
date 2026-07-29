/**
 * Hook to track online/offline status
 */

import { useEffect } from 'react';
import { useOfflineStore } from '@/stores/offlineStore';

export function useNetworkStatus() {
  const isOffline = useOfflineStore((state) => state.isOffline);
  const setOffline = useOfflineStore((state) => state.setOffline);

  useEffect(() => {
    // Set initial state
    setOffline(!navigator.onLine);

    const handleOnline = () => {
      console.log('[NetworkStatus] Online');
      setOffline(false);
    };

    const handleOffline = () => {
      console.log('[NetworkStatus] Offline');
      setOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);

  return {
    isOnline: !isOffline,
    isOffline,
  };
}
