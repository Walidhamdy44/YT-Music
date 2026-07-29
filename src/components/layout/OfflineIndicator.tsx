"use client";

import { useState, useEffect } from "react";
import { WifiOff, X } from "lucide-react";
import { useOfflineStore } from "@/stores/offlineStore";
import { cn } from "@/lib/utils";

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const isOffline = useOfflineStore((state) => state.isOffline);
  const cachedCount = useOfflineStore((state) => state.cachedTracks.size);
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  // Reset dismissed state when coming back online
  useEffect(() => {
    if (!isOffline) {
      setDismissed(false);
      setShow(false);
    } else {
      // Small delay before showing
      const timer = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isOffline]);

  if (!isOffline || dismissed || !show) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2",
        "flex items-center justify-between gap-4",
        "animate-in slide-in-from-top duration-300",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <WifiOff size={16} />
        <span>You&apos;re offline</span>
        <span className="text-amber-800">
          {cachedCount > 0
            ? `— ${cachedCount} cached song${cachedCount !== 1 ? "s" : ""} available`
            : "— No cached songs available"}
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-amber-600/20 rounded transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

/**
 * Compact offline indicator for use in header/sidebar
 */
export function OfflineIndicatorCompact({ className }: OfflineIndicatorProps) {
  const isOffline = useOfflineStore((state) => state.isOffline);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
        "bg-amber-500/10 text-amber-600 text-xs font-medium",
        className
      )}
      title="You're offline - only cached songs available"
    >
      <WifiOff size={12} />
      <span>Offline</span>
    </div>
  );
}
