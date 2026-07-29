"use client";

import { useState, useEffect, useCallback } from "react";
import { HardDrive, Trash2, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { useOfflineStore } from "@/stores/offlineStore";
import { useStorageStats, useRefreshStorageStats } from "@/hooks/useStorageStats";
import { storageManager, StorageManager } from "@/lib/storageManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CachedTrackMetadata } from "@/lib/cacheMetadataStore";

export function StorageDashboard() {
  const { used, quota, cachedCount, usedFormatted, quotaFormatted, percentUsed, isLow } = useStorageStats();
  const cachedTracks = useOfflineStore((state) => state.cachedTracks);
  const removeCachedTrack = useOfflineStore((state) => state.removeCachedTrack);
  const refreshStats = useRefreshStorageStats();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Get sorted list of cached tracks
  const sortedTracks = Array.from(cachedTracks.values()).sort(
    (a, b) => b.cachedAt - a.cachedAt
  );

  // Filter by search query
  const filteredTracks = sortedTracks.filter((track) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      track.title.toLowerCase().includes(query) ||
      track.artist.toLowerCase().includes(query)
    );
  });

  // Toggle track selection
  const toggleSelect = (videoId: string) => {
    const newSelected = new Set(selectedTracks);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedTracks(newSelected);
  };

  // Select all filtered tracks
  const selectAll = () => {
    if (selectedTracks.size === filteredTracks.length) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(filteredTracks.map((t) => t.videoId)));
    }
  };

  // Delete selected tracks
  const deleteSelected = async () => {
    for (const videoId of selectedTracks) {
      await storageManager.deleteTrack(videoId);
      removeCachedTrack(videoId);
    }
    setSelectedTracks(new Set());
    await refreshStats();
  };

  // Clear all cache
  const clearAllCache = async () => {
    setIsClearing(true);
    try {
      await storageManager.clearAllCache();
      useOfflineStore.getState().setCachedTracks([]);
      await refreshStats();
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  // Delete single track
  const deleteTrack = async (videoId: string) => {
    await storageManager.deleteTrack(videoId);
    removeCachedTrack(videoId);
    await refreshStats();
  };

  // Calculate selected size
  const selectedSize = Array.from(selectedTracks).reduce((sum, videoId) => {
    const track = cachedTracks.get(videoId);
    return sum + (track?.fileSize || 0);
  }, 0);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Offline Storage</h1>

      {/* Storage Usage */}
      <div className="bg-surface-container rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <HardDrive className="text-primary" size={24} />
          <div className="flex-1">
            <p className="font-medium">Storage Used</p>
            <p className="text-sm text-on-surface-variant">
              {cachedCount} song{cachedCount !== 1 ? "s" : ""} cached
            </p>
          </div>
          <div className="text-right">
            <p className="font-medium">{usedFormatted}</p>
            <p className="text-sm text-on-surface-variant">of {quotaFormatted}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              isLow ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>

        {isLow && (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertTriangle size={16} />
            <span>Storage is running low. Consider removing some cached songs.</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
            <Input
              placeholder="Search cached songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {selectedTracks.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={deleteSelected}
            className="gap-2"
          >
            <Trash2 size={14} />
            Delete {selectedTracks.size} ({StorageManager.formatBytes(selectedSize)})
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowClearConfirm(true)}
          disabled={cachedCount === 0}
        >
          Clear All
        </Button>
      </div>

      {/* Clear All Confirmation */}
      {showClearConfirm && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="font-medium text-destructive mb-2">Clear all cached songs?</p>
          <p className="text-sm text-on-surface-variant mb-4">
            This will remove {cachedCount} song{cachedCount !== 1 ? "s" : ""} and free up {usedFormatted}.
            This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={clearAllCache}
              disabled={isClearing}
            >
              {isClearing ? "Clearing..." : "Yes, Clear All"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClearConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Cached Songs List */}
      <div className="space-y-2">
        {filteredTracks.length > 0 && (
          <div className="flex items-center justify-between text-sm text-on-surface-variant px-2">
            <button
              onClick={selectAll}
              className="hover:text-on-surface transition-colors"
            >
              {selectedTracks.size === filteredTracks.length ? "Deselect All" : "Select All"}
            </button>
            <span>{filteredTracks.length} song{filteredTracks.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {filteredTracks.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            {cachedCount === 0 ? (
              <>
                <HardDrive size={48} className="mx-auto mb-4 opacity-50" />
                <p>No cached songs yet</p>
                <p className="text-sm">Songs will be cached automatically when you play them</p>
              </>
            ) : (
              <p>No songs match your search</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTracks.map((track) => (
              <CachedTrackItem
                key={track.videoId}
                track={track}
                isSelected={selectedTracks.has(track.videoId)}
                onSelect={() => toggleSelect(track.videoId)}
                onDelete={() => deleteTrack(track.videoId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Individual track item
function CachedTrackItem({
  track,
  isSelected,
  onSelect,
  onDelete,
}: {
  track: CachedTrackMetadata;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
        isSelected ? "bg-primary/10" : "hover:bg-surface-container"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={onSelect}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          isSelected
            ? "bg-primary border-primary"
            : "border-on-surface-variant hover:border-primary"
        }`}
      >
        {isSelected && <CheckCircle2 size={14} className="text-on-primary" />}
      </button>

      {/* Thumbnail */}
      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-surface-container-high">
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt={track.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-[16px]">
              music_note
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.title}</p>
        <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
      </div>

      {/* Meta */}
      <div className="text-right text-xs text-on-surface-variant hidden sm:block">
        <p>{StorageManager.formatBytes(track.fileSize)}</p>
        <p>{formatDate(track.cachedAt)}</p>
      </div>

      {/* Manual download badge */}
      {track.isManualDownload && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          Downloaded
        </span>
      )}

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1.5 rounded-full hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
        title="Remove from cache"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
