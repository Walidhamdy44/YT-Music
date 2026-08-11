"use client";

import { FolderOpen, FolderPlus, Check, X } from "lucide-react";
import { useFolderStore } from "@/stores/folderStore";
import type { CachedTrackMetadata } from "@/lib/cacheMetadataStore";

interface MoveToFolderSheetProps {
  track: CachedTrackMetadata;
  currentFolderIds: string[];
  onAdd: (folderId: string) => void;
  onRemove: (folderId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

export function MoveToFolderSheet({
  track,
  currentFolderIds,
  onAdd,
  onRemove,
  onCreateNew,
  onClose,
}: MoveToFolderSheetProps) {
  const folders = useFolderStore((s) => s.folders);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      {/*
        Use pb-safe + extra bottom padding so the sheet clears the player bar.
        The player bar is ~80px. We use pb-24 (96px) as a safe buffer.
        On devices with a notch/home indicator this adds a little extra too.
      */}
      <div
        className="bg-surface w-full max-w-lg rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "70vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-outline-variant" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant/20">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-xs text-on-surface-variant">Add to folder</p>
            <p className="text-sm font-semibold text-on-surface truncate">{track.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container transition-colors flex-shrink-0"
          >
            <X size={16} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Scrollable folder list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {folders.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-6">
              No folders yet — create one below
            </p>
          )}
          {folders.map((folder) => {
            const inFolder = currentFolderIds.includes(folder.id);
            return (
              <button
                key={folder.id}
                onClick={() => (inFolder ? onRemove(folder.id) : onAdd(folder.id))}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                  inFolder ? "bg-primary/10" : "hover:bg-surface-container active:bg-surface-container"
                }`}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: folder.color + "33" }}
                >
                  <FolderOpen size={20} style={{ color: folder.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{folder.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {(folder.videoIds ?? []).length} song{(folder.videoIds ?? []).length !== 1 ? "s" : ""}
                  </p>
                </div>
                {inFolder && <Check size={18} className="text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Create new folder — always visible, sticks above player bar */}
        <div className="px-2 pt-1 pb-24 border-t border-outline-variant/20">
          <button
            onClick={onCreateNew}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-outline-variant hover:bg-surface-container active:bg-surface-container transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
              <FolderPlus size={20} className="text-on-surface-variant" />
            </div>
            <span className="text-sm font-medium text-on-surface-variant">New folder</span>
          </button>
        </div>
      </div>
    </div>
  );
}
