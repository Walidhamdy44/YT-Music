"use client";

import { useState, useCallback } from "react";
import { Download, CheckCircle2, Loader2, X, Trash2 } from "lucide-react";
import { useCacheStatus } from "@/hooks/useCacheStatus";
import { useOfflineStore } from "@/stores/offlineStore";
import { offlinePlaybackService } from "@/lib/offlinePlaybackService";
import { CacheMetadataStore } from "@/lib/cacheMetadataStore";
import { StorageManager } from "@/lib/storageManager";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Track } from "@/types";

interface DownloadButtonProps {
  track: Track;
  variant?: "icon" | "button";
  size?: "sm" | "default";
  className?: string;
}

export function DownloadButton({
  track,
  variant = "icon",
  size = "sm",
  className,
}: DownloadButtonProps) {
  const { isCached, isDownloading, progress, fileSize } = useCacheStatus(track.videoId);
  const isOffline = useOfflineStore((state) => state.isOffline);
  const addCachedTrack = useOfflineStore((state) => state.addCachedTrack);
  const removeCachedTrack = useOfflineStore((state) => state.removeCachedTrack);
  const addToDownloadQueue = useOfflineStore((state) => state.addToDownloadQueue);
  const updateDownloadProgress = useOfflineStore((state) => state.updateDownloadProgress);
  const updateDownloadStatus = useOfflineStore((state) => state.updateDownloadStatus);
  const removeFromDownloadQueue = useOfflineStore((state) => state.removeFromDownloadQueue);

  const [showDelete, setShowDelete] = useState(false);

  const iconSize = size === "sm" ? 16 : 20;

  // Handle download click
  const handleDownload = useCallback(async () => {
    if (isDownloading || isCached || isOffline) return;

    // Add to queue
    addToDownloadQueue({
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
    });

    updateDownloadStatus(track.videoId, "downloading");

    try {
      const success = await offlinePlaybackService.downloadForOffline(
        track,
        (progress) => {
          updateDownloadProgress(track.videoId, progress);
        }
      );

      if (success) {
        updateDownloadStatus(track.videoId, "completed");
        // Get the metadata and add to store
        const cacheStatus = await offlinePlaybackService.getCacheStatus(track.videoId);
        if (cacheStatus.isCached && cacheStatus.fileSize) {
          const metadata = CacheMetadataStore.createMetadata(track, cacheStatus.fileSize, true);
          addCachedTrack(metadata);
        }
        // Remove from queue after short delay
        setTimeout(() => removeFromDownloadQueue(track.videoId), 1000);
      } else {
        updateDownloadStatus(track.videoId, "failed", "Download failed");
      }
    } catch (e) {
      updateDownloadStatus(track.videoId, "failed", String(e));
    }
  }, [
    track,
    isDownloading,
    isCached,
    isOffline,
    addToDownloadQueue,
    updateDownloadProgress,
    updateDownloadStatus,
    removeFromDownloadQueue,
    addCachedTrack,
  ]);

  // Handle remove from cache
  const handleRemove = useCallback(async () => {
    await offlinePlaybackService.removeFromCache(track.videoId);
    removeCachedTrack(track.videoId);
    setShowDelete(false);
  }, [track.videoId, removeCachedTrack]);

  // Handle cancel download
  const handleCancel = useCallback(() => {
    removeFromDownloadQueue(track.videoId);
  }, [track.videoId, removeFromDownloadQueue]);

  // Icon-only variant
  if (variant === "icon") {
    // Downloading
    if (isDownloading) {
      return (
        <button
          onClick={handleCancel}
          className={cn(
            "relative inline-flex items-center justify-center p-1 rounded-full hover:bg-muted/50 transition-colors",
            className
          )}
          title={`Downloading ${progress}% - Click to cancel`}
        >
          <Loader2 size={iconSize} className="animate-spin text-primary" />
          <span className="absolute -bottom-2 text-[9px] text-primary font-medium">
            {progress}%
          </span>
        </button>
      );
    }

    // Cached - show checkmark, click for delete option
    if (isCached) {
      if (showDelete) {
        return (
          <div className={cn("inline-flex items-center gap-1", className)}>
            <button
              onClick={handleRemove}
              className="p-1 rounded-full hover:bg-destructive/10 transition-colors"
              title="Remove from cache"
            >
              <Trash2 size={iconSize} className="text-destructive" />
            </button>
            <button
              onClick={() => setShowDelete(false)}
              className="p-1 rounded-full hover:bg-muted/50 transition-colors"
              title="Cancel"
            >
              <X size={iconSize - 2} className="text-muted-foreground" />
            </button>
          </div>
        );
      }

      return (
        <button
          onClick={() => setShowDelete(true)}
          className={cn(
            "inline-flex items-center justify-center p-1 rounded-full hover:bg-muted/50 transition-colors",
            className
          )}
          title={`Cached (${fileSize ? StorageManager.formatBytes(fileSize) : ""})`}
        >
          <CheckCircle2 size={iconSize} className="text-green-500" />
        </button>
      );
    }

    // Not cached - download button
    return (
      <button
        onClick={handleDownload}
        disabled={isOffline}
        className={cn(
          "inline-flex items-center justify-center p-1 rounded-full hover:bg-muted/50 transition-colors",
          isOffline && "opacity-50 cursor-not-allowed",
          className
        )}
        title={isOffline ? "Cannot download while offline" : "Download for offline"}
      >
        <Download size={iconSize} className="text-muted-foreground" />
      </button>
    );
  }

  // Button variant
  if (isDownloading) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleCancel}
        className={cn("gap-2", className)}
      >
        <Loader2 size={14} className="animate-spin" />
        {progress}%
      </Button>
    );
  }

  if (isCached) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleRemove}
        className={cn("gap-2 text-green-600", className)}
      >
        <CheckCircle2 size={14} />
        Downloaded
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleDownload}
      disabled={isOffline}
      className={cn("gap-2", className)}
    >
      <Download size={14} />
      Download
    </Button>
  );
}
