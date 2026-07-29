"use client";

import { Download, CheckCircle2, Loader2, WifiOff } from "lucide-react";
import { useCacheStatus } from "@/hooks/useCacheStatus";
import { useOfflineStore } from "@/stores/offlineStore";
import { StorageManager } from "@/lib/storageManager";
import { cn } from "@/lib/utils";

interface CacheStatusIndicatorProps {
  videoId: string;
  size?: "sm" | "md";
  showTooltip?: boolean;
  className?: string;
}

export function CacheStatusIndicator({
  videoId,
  size = "sm",
  showTooltip = true,
  className,
}: CacheStatusIndicatorProps) {
  const { isCached, isDownloading, progress, fileSize, cachedAt } = useCacheStatus(videoId);
  const isOffline = useOfflineStore((state) => state.isOffline);

  const iconSize = size === "sm" ? 14 : 18;

  // Format tooltip content
  const getTooltip = () => {
    if (isDownloading) {
      return `Downloading... ${progress}%`;
    }
    if (isCached && fileSize && cachedAt) {
      const sizeStr = StorageManager.formatBytes(fileSize);
      const dateStr = new Date(cachedAt).toLocaleDateString();
      return `Cached (${sizeStr}) on ${dateStr}`;
    }
    if (isOffline && !isCached) {
      return "Not available offline";
    }
    return "Not cached";
  };

  // Downloading state
  if (isDownloading) {
    return (
      <div
        className={cn("relative inline-flex items-center justify-center", className)}
        title={showTooltip ? getTooltip() : undefined}
      >
        <Loader2
          size={iconSize}
          className="animate-spin text-primary"
        />
        {size === "md" && (
          <span className="absolute -bottom-1 text-[10px] text-primary font-medium">
            {progress}%
          </span>
        )}
      </div>
    );
  }

  // Cached state
  if (isCached) {
    return (
      <div
        className={cn("inline-flex items-center", className)}
        title={showTooltip ? getTooltip() : undefined}
      >
        <CheckCircle2
          size={iconSize}
          className="text-green-500"
        />
      </div>
    );
  }

  // Offline + not cached
  if (isOffline) {
    return (
      <div
        className={cn("inline-flex items-center", className)}
        title={showTooltip ? getTooltip() : undefined}
      >
        <WifiOff
          size={iconSize}
          className="text-muted-foreground/50"
        />
      </div>
    );
  }

  // Not cached (online)
  return (
    <div
      className={cn("inline-flex items-center", className)}
      title={showTooltip ? getTooltip() : undefined}
    >
      <Download
        size={iconSize}
        className="text-muted-foreground/40"
      />
    </div>
  );
}
