"use client";

import { useState, useCallback } from "react";
import { Download, CheckCircle2, Loader2, X, StopCircle } from "lucide-react";
import { useOfflineStore } from "@/stores/offlineStore";
import { downloadQueue } from "@/lib/downloadQueue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Track } from "@/types";

interface DownloadPlaylistButtonProps {
  tracks: Track[];
  playlistName: string;
  className?: string;
}

export function DownloadPlaylistButton({
  tracks,
  playlistName,
  className,
}: DownloadPlaylistButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const isOffline = useOfflineStore((state) => state.isOffline);
  const isTrackCached = useOfflineStore((state) => state.isTrackCached);
  const downloadQueueState = useOfflineStore((state) => state.downloadQueue);

  // Count how many tracks are already cached
  const cachedCount = tracks.filter((t) => isTrackCached(t.videoId)).length;
  const allCached = cachedCount === tracks.length && tracks.length > 0;
  const tracksToDownload = tracks.filter((t) => !isTrackCached(t.videoId));
  
  // Count active downloads from this playlist
  const activeDownloads = downloadQueueState.filter(
    (d) => tracks.some((t) => t.videoId === d.videoId) && 
           (d.status === 'downloading' || d.status === 'pending')
  ).length;

  const handleDownloadAll = useCallback(async () => {
    if (isDownloading || isOffline || tracksToDownload.length === 0) return;

    setIsDownloading(true);
    setDownloadedCount(0);

    // Add all tracks to download queue
    for (const track of tracksToDownload) {
      await downloadQueue.addToQueue(track);
    }

    // Monitor progress
    const checkProgress = setInterval(() => {
      const store = useOfflineStore.getState();
      const completed = tracks.filter((t) => store.isTrackCached(t.videoId)).length;
      setDownloadedCount(completed);

      // Check if all done
      const pending = tracksToDownload.filter((t) => {
        const task = store.getDownloadTask(t.videoId);
        return task && (task.status === 'downloading' || task.status === 'pending');
      });

      if (pending.length === 0) {
        clearInterval(checkProgress);
        setIsDownloading(false);
      }
    }, 500);
  }, [tracks, tracksToDownload, isDownloading, isOffline]);

  const handleCancelAll = useCallback(() => {
    for (const track of tracksToDownload) {
      downloadQueue.cancelDownload(track.videoId);
    }
    setIsDownloading(false);
  }, [tracksToDownload]);

  // All cached
  if (allCached) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className={cn("gap-2 text-green-600", className)}
      >
        <CheckCircle2 size={16} />
        All Downloaded ({tracks.length})
      </Button>
    );
  }

  // Downloading
  if (isDownloading || activeDownloads > 0) {
    const progress = Math.round(((cachedCount + downloadedCount) / tracks.length) * 100);
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleCancelAll}
        className={cn("gap-2", className)}
      >
        <Loader2 size={16} className="animate-spin" />
        {cachedCount}/{tracks.length} ({progress}%)
        <X size={14} className="ml-1" />
      </Button>
    );
  }

  // Ready to download
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadAll}
      disabled={isOffline || tracksToDownload.length === 0}
      className={cn("gap-2", className)}
    >
      <Download size={16} />
      Download All ({tracksToDownload.length})
    </Button>
  );
}
