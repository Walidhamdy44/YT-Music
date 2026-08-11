"use client";

import { useState, useMemo } from "react";
import { X, Search, CheckCircle2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StorageManager } from "@/lib/storageManager";
import type { CachedTrackMetadata } from "@/lib/cacheMetadataStore";

interface AddSongsToFolderModalProps {
  /** All cached tracks available to add */
  allTracks: CachedTrackMetadata[];
  /** Video IDs already in this folder (pre-checked) */
  existingVideoIds: string[];
  folderName: string;
  folderColor: string;
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}

export function AddSongsToFolderModal({
  allTracks,
  existingVideoIds,
  folderName,
  folderColor,
  onConfirm,
  onCancel,
}: AddSongsToFolderModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(existingVideoIds));

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q
      ? allTracks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q)
        )
      : allTracks;
  }, [allTracks, query]);

  const toggle = (videoId: string) => {
    const s = new Set(selected);
    s.has(videoId) ? s.delete(videoId) : s.add(videoId);
    setSelected(s);
  };

  const toggleAll = () => {
    if (filtered.every((t) => selected.has(t.videoId))) {
      // deselect all visible
      const s = new Set(selected);
      filtered.forEach((t) => s.delete(t.videoId));
      setSelected(s);
    } else {
      // select all visible
      const s = new Set(selected);
      filtered.forEach((t) => s.add(t.videoId));
      setSelected(s);
    }
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.videoId));
  const addedCount = selected.size;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/20">
          <div>
            <h2 className="font-semibold text-on-surface">Add songs to folder</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              <span style={{ color: folderColor }} className="font-medium">{folderName}</span>
              {" · "}{addedCount} selected
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-full hover:bg-surface-container transition-colors"
          >
            <X size={18} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-outline-variant/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={15} />
            <Input
              placeholder="Search songs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Select all row */}
        {filtered.length > 0 && (
          <div className="px-4 py-2 flex items-center justify-between text-xs text-on-surface-variant border-b border-outline-variant/10">
            <button onClick={toggleAll} className="hover:text-on-surface transition-colors">
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </button>
            <span>{filtered.length} song{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Song list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant">
              <Music size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No songs found</p>
            </div>
          ) : (
            <div className="space-y-0.5 p-2">
              {filtered.map((track) => {
                const isSelected = selected.has(track.videoId);
                return (
                  <button
                    key={track.videoId}
                    onClick={() => toggle(track.videoId)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                      isSelected
                        ? "bg-primary/10"
                        : "hover:bg-surface-container"
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-on-surface-variant"
                      }`}
                    >
                      {isSelected && <CheckCircle2 size={13} className="text-on-primary" />}
                    </div>

                    {/* Thumbnail */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high">
                      {track.thumbnail ? (
                        <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={16} className="text-on-surface-variant" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{track.title}</p>
                      <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
                    </div>

                    {/* Size */}
                    <span className="text-xs text-on-surface-variant flex-shrink-0">
                      {StorageManager.formatBytes(track.fileSize)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/20 flex gap-3">
          <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(Array.from(selected))}
            className="flex-1"
            style={{ backgroundColor: folderColor }}
          >
            Add {addedCount} song{addedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
