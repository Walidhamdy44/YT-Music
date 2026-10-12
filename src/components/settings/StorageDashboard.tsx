"use client";

import { useState, useCallback, useEffect } from "react";
import {
  HardDrive, Trash2, Search, CheckCircle2, AlertTriangle, Shuffle,
  FolderPlus, FolderOpen, Pencil, FolderX, Play, ListPlus,
} from "lucide-react";
import { useOfflineStore } from "@/stores/offlineStore";
import { useFolderStore } from "@/stores/folderStore";
import { useStorageStats, useRefreshStorageStats } from "@/hooks/useStorageStats";
import { storageManager, StorageManager } from "@/lib/storageManager";
import {
  getAllFolders, createFolder, updateFolder as updateFolderDb,
  deleteFolder as deleteFolderDb, addSongToFolder, removeSongFromFolder,
  getFoldersForSong, type OfflineFolder,
} from "@/lib/offlineFolderStore";
import { FolderDialog } from "@/components/offline/FolderDialog";
import { MoveToFolderSheet } from "@/components/offline/MoveToFolderSheet";
import { AddSongsToFolderModal } from "@/components/offline/AddSongsToFolderModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueueStore } from "@/stores/queueStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUIStore } from "@/stores/uiStore";
import { playTrack } from "@/components/player/PlayerProvider";
import type { CachedTrackMetadata } from "@/lib/cacheMetadataStore";
import type { Track } from "@/types";

export function StorageDashboard() {
  const { cachedCount, usedFormatted, quotaFormatted, percentUsed, isLow } = useStorageStats();
  const cachedTracks = useOfflineStore((s) => s.cachedTracks);
  const removeCachedTrack = useOfflineStore((s) => s.removeCachedTrack);
  const refreshStats = useRefreshStorageStats();

  const { folders, setFolders, addFolder, updateFolder: updateFolderStore, removeFolder } = useFolderStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Folder state
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<OfflineFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<OfflineFolder | null>(null);
  const [moveTrack, setMoveTrack] = useState<CachedTrackMetadata | null>(null);
  const [moveTrackFolderIds, setMoveTrackFolderIds] = useState<string[]>([]);
  const [showAddSongsModal, setShowAddSongsModal] = useState(false);

  const refreshFolders = useCallback(async () => {
    const all = await getAllFolders();
    setFolders(all);
  }, [setFolders]);

  useEffect(() => { refreshFolders(); }, [refreshFolders]);

  // ── derived ──────────────────────────────────────────────────────────────
  const openFolder = folders.find((f) => f.id === openFolderId) ?? null;
  const sortedTracks = Array.from(cachedTracks.values()).sort((a, b) => b.cachedAt - a.cachedAt);

  const displayTracks = openFolder
    ? (openFolder.videoIds ?? []).map((id) => cachedTracks.get(id)).filter((t): t is CachedTrackMetadata => !!t)
    : sortedTracks.filter((t) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
      });

  // ── folder CRUD ──────────────────────────────────────────────────────────
  const handleCreateFolder = async (name: string, color: string) => {
    const folder = await createFolder(name, color);
    addFolder(folder);
    setShowCreateFolder(false);
  };

  const handleEditFolder = async (name: string, color: string) => {
    if (!editingFolder) return;
    const updated = await updateFolderDb(editingFolder.id, { name, color });
    if (updated) updateFolderStore(updated);
    setEditingFolder(null);
  };

  const handleDeleteFolder = async () => {
    if (!deletingFolder) return;
    await deleteFolderDb(deletingFolder.id);
    removeFolder(deletingFolder.id);
    if (openFolderId === deletingFolder.id) setOpenFolderId(null);
    setDeletingFolder(null);
  };

  // ── move-to-folder ───────────────────────────────────────────────────────
  const openMoveSheet = async (track: CachedTrackMetadata) => {
    const inFolders = await getFoldersForSong(track.videoId);
    setMoveTrackFolderIds(inFolders.map((f) => f.id));
    setMoveTrack(track);
  };

  const handleAddToFolder = async (folderId: string) => {
    if (!moveTrack) return;
    await addSongToFolder(folderId, moveTrack.videoId);
    await refreshFolders();
    setMoveTrackFolderIds((p) => p.includes(folderId) ? p : [...p, folderId]);
  };

  // Bulk add: update folder videoIds to exactly the selected set
  const handleBulkAddSongs = async (selectedIds: string[]) => {
    if (!openFolder) return;
    await updateFolderDb(openFolder.id, { videoIds: selectedIds });
    await refreshFolders();
    setShowAddSongsModal(false);
  };
  const handleRemoveFromFolder = async (folderId: string) => {
    if (!moveTrack) return;
    await removeSongFromFolder(folderId, moveTrack.videoId);
    await refreshFolders();
    setMoveTrackFolderIds((p) => p.filter((id) => id !== folderId));
  };

  // ── delete songs ─────────────────────────────────────────────────────────
  const deleteTrack = async (videoId: string) => {
    await storageManager.deleteTrack(videoId);
    removeCachedTrack(videoId);
    await refreshStats();
    await refreshFolders();
  };

  const deleteSelected = async () => {
    for (const videoId of selectedTracks) {
      await storageManager.deleteTrack(videoId);
      removeCachedTrack(videoId);
    }
    setSelectedTracks(new Set());
    await refreshStats();
    await refreshFolders();
  };

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

  // ── selection ────────────────────────────────────────────────────────────
  const toggleSelect = (videoId: string) => {
    const s = new Set(selectedTracks);
    if (s.has(videoId)) s.delete(videoId);
    else s.add(videoId);
    setSelectedTracks(s);
  };

  const selectAll = () => {
    if (selectedTracks.size === displayTracks.length) setSelectedTracks(new Set());
    else setSelectedTracks(new Set(displayTracks.map((t) => t.videoId)));
  };

  const selectedSize = Array.from(selectedTracks).reduce((sum, id) => sum + (cachedTracks.get(id)?.fileSize || 0), 0);

  // ── playback ─────────────────────────────────────────────────────────────
  const shufflePlayAll = () => {
    if (!sortedTracks.length) return;
    const tracks: Track[] = sortedTracks.map((m) => ({ id: m.videoId, videoId: m.videoId, title: m.title, artist: m.artist, thumbnail: m.thumbnail, duration: m.duration }));
    const shuffled = shuffleTracks(tracks);
    useQueueStore.getState().setQueue(shuffled, 0);
    usePlayerStore.getState().toggleShuffle();
    if (!usePlayerStore.getState().isShuffled) usePlayerStore.getState().toggleShuffle();
    playTrack(shuffled[0], true);
  };

  const playFolder = (folder: OfflineFolder, shuffle = false) => {
    const tracks = (folder.videoIds ?? [])
      .map((id) => cachedTracks.get(id))
      .filter((t): t is CachedTrackMetadata => !!t)
      .map(cachedMetadataToTrack);
    if (!tracks.length) return;
    const queue = shuffle ? shuffleTracks(tracks) : tracks;
    useQueueStore.getState().setQueue(queue, 0);
    if (usePlayerStore.getState().isShuffled !== shuffle) usePlayerStore.getState().toggleShuffle();
    void playTrack(queue[0], true);
  };

  const playDownloadedTrack = (selectedTrack: CachedTrackMetadata) => {
    const player = usePlayerStore.getState();
    if (player.currentTrack?.videoId === selectedTrack.videoId && player.status !== "idle" && player.status !== "error" && window.matchMedia("(max-width: 767px)").matches) {
      useUIStore.getState().setFullscreenPlayer(true);
      return;
    }
    const tracks = displayTracks.map(cachedMetadataToTrack);
    const selectedIndex = tracks.findIndex(
      (track) => track.videoId === selectedTrack.videoId,
    );
    if (selectedIndex < 0) return;

    useQueueStore.getState().setQueue(tracks, selectedIndex);
    void playTrack(tracks[selectedIndex], true);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Offline Storage</h1>

      {/* ── Storage bar ──────────────────────────────────────────────── */}
      <div className="bg-surface-container rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <HardDrive className="text-primary" size={24} />
          <div className="flex-1">
            <p className="font-medium">Storage Used</p>
            <p className="text-sm text-on-surface-variant">{cachedCount} song{cachedCount !== 1 ? "s" : ""} cached</p>
          </div>
          <div className="text-right">
            <p className="font-medium">{usedFormatted}</p>
            <p className="text-sm text-on-surface-variant">of {quotaFormatted}</p>
          </div>
        </div>
        <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
          <div className={`h-full transition-all ${isLow ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(percentUsed, 100)}%` }} />
        </div>
        {isLow && (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertTriangle size={16} />
            <span>Storage is running low. Consider removing some cached songs.</span>
          </div>
        )}
        {cachedCount > 0 && (
          <Button onClick={shufflePlayAll} className="w-full gap-2 mt-2" size="lg">
            <Shuffle size={20} />
            Shuffle Play All ({cachedCount} songs)
          </Button>
        )}
      </div>

      {/* ── Folders section ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-on-surface">
            {openFolder ? (
              <button onClick={() => setOpenFolderId(null)} className="flex items-center gap-2 hover:text-primary transition-colors">
                <span className="text-on-surface-variant text-sm">Folders</span>
                <span className="text-on-surface-variant mx-1">/</span>
                <FolderOpen size={15} style={{ color: openFolder.color }} />
                <span style={{ color: openFolder.color }}>{openFolder.name}</span>
              </button>
            ) : "Folders"}
          </h2>
          <div className="flex items-center gap-1">
            {openFolder ? (
              <>
                <button onClick={() => playFolder(openFolder)} className="hidden md:flex p-1.5 rounded-full hover:bg-surface-container transition-colors" title="Play all"><Play size={14} className="text-on-surface-variant" /></button>
                <button onClick={() => setShowAddSongsModal(true)} className="p-1.5 rounded-full hover:bg-surface-container transition-colors" title="Add songs to folder"><ListPlus size={14} className="text-on-surface-variant" /></button>
                <button onClick={() => setEditingFolder(openFolder)} className="p-1.5 rounded-full hover:bg-surface-container transition-colors" title="Rename"><Pencil size={14} className="text-on-surface-variant" /></button>
                <button onClick={() => setDeletingFolder(openFolder)} className="p-1.5 rounded-full hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors" title="Delete folder"><Trash2 size={14} /></button>
              </>
            ) : (
              <button onClick={() => setShowCreateFolder(true)} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <FolderPlus size={14} /> New folder
              </button>
            )}
          </div>
        </div>

        {openFolder && (
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <Button variant="outline" disabled={displayTracks.length === 0} onClick={() => playFolder(openFolder)} className="min-h-11 gap-2">
              <Play size={18} aria-hidden="true" /> Play all
            </Button>
            <Button disabled={displayTracks.length === 0} onClick={() => playFolder(openFolder, true)} className="min-h-11 gap-2">
              <Shuffle size={18} aria-hidden="true" /> Shuffle
            </Button>
          </div>
        )}

        {/* Folder grid */}
        {!openFolder && folders.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {folders.map((folder) => {
              const videoIds = folder.videoIds ?? [];
              const coverTracks = videoIds.slice(0, 4).map((id) => cachedTracks.get(id)).filter(Boolean) as CachedTrackMetadata[];
              return (
                <FolderCard key={folder.id} folder={folder} coverTracks={coverTracks}
                  onClick={() => setOpenFolderId(folder.id)}
                  onEdit={() => setEditingFolder(folder)}
                  onDelete={() => setDeletingFolder(folder)}
                  onPlay={() => playFolder(folder)} />
              );
            })}
          </div>
        )}

        {openFolder && displayTracks.length === 0 && (
          <div className="text-center py-8 text-on-surface-variant">
            <FolderX size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No songs in this folder yet</p>
            <button
              onClick={() => setShowAddSongsModal(true)}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border border-outline-variant/40 hover:bg-surface-container transition-colors"
              style={{ color: openFolder.color }}
            >
              <ListPlus size={15} />
              Add new items here!
            </button>
          </div>
        )}
      </div>

      {/* ── Search / bulk actions (hidden inside folder view) ────────── */}
      {!openFolder && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
              <Input placeholder="Search cached songs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
          </div>
          {selectedTracks.size > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteSelected} className="gap-2">
              <Trash2 size={14} />
              Delete {selectedTracks.size} ({StorageManager.formatBytes(selectedSize)})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(true)} disabled={cachedCount === 0}>Clear All</Button>
        </div>
      )}

      {/* Clear All confirmation */}
      {showClearConfirm && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="font-medium text-destructive mb-2">Clear all cached songs?</p>
          <p className="text-sm text-on-surface-variant mb-4">This will remove {cachedCount} song{cachedCount !== 1 ? "s" : ""} and free up {usedFormatted}. This action cannot be undone.</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={clearAllCache} disabled={isClearing}>{isClearing ? "Clearing..." : "Yes, Clear All"}</Button>
            <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Song list ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {displayTracks.length > 0 && !openFolder && (
          <div className="flex items-center justify-between text-sm text-on-surface-variant px-2">
            <button onClick={selectAll} className="hover:text-on-surface transition-colors">
              {selectedTracks.size === displayTracks.length ? "Deselect All" : "Select All"}
            </button>
            <span>{displayTracks.length} song{displayTracks.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {displayTracks.length === 0 && !openFolder ? (
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
            {displayTracks.map((track) => (
              <CachedTrackItem
                key={track.videoId}
                 track={track}
                 isSelected={selectedTracks.has(track.videoId)}
                 onPlay={() => playDownloadedTrack(track)}
                 onSelect={() => toggleSelect(track.videoId)}
                onDelete={() => deleteTrack(track.videoId)}
                onAddToFolder={() => openMoveSheet(track)}
                showCheckbox={!openFolder}
                onRemoveFromFolder={openFolder ? async () => {
                  await removeSongFromFolder(openFolder.id, track.videoId);
                  await refreshFolders();
                } : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Dialogs & sheets ─────────────────────────────────────────── */}
      {showCreateFolder && <FolderDialog title="New folder" onConfirm={handleCreateFolder} onCancel={() => setShowCreateFolder(false)} />}

      {editingFolder && (
        <FolderDialog title="Edit folder" initialName={editingFolder.name} initialColor={editingFolder.color}
          onConfirm={handleEditFolder} onCancel={() => setEditingFolder(null)} />
      )}

      {deletingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeletingFolder(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Delete folder?</h3>
            <p className="text-sm text-on-surface-variant">&ldquo;{deletingFolder.name}&rdquo; will be deleted. Your downloaded songs won&apos;t be affected.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeletingFolder(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteFolder}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {moveTrack && (
        <MoveToFolderSheet track={moveTrack} currentFolderIds={moveTrackFolderIds}
          onAdd={handleAddToFolder} onRemove={handleRemoveFromFolder}
          onCreateNew={() => { setMoveTrack(null); setShowCreateFolder(true); }}
          onClose={() => setMoveTrack(null)} />
      )}

      {showAddSongsModal && openFolder && (
        <AddSongsToFolderModal
          allTracks={sortedTracks}
          existingVideoIds={openFolder.videoIds ?? []}
          folderName={openFolder.name}
          folderColor={openFolder.color}
          onConfirm={handleBulkAddSongs}
          onCancel={() => setShowAddSongsModal(false)}
        />
      )}
    </div>
  );
}

// ── Folder card ───────────────────────────────────────────────────────────────
function FolderCard({ folder, coverTracks, onClick, onEdit, onDelete, onPlay }: {
  folder: OfflineFolder; coverTracks: CachedTrackMetadata[];
  onClick: () => void; onEdit: () => void; onDelete: () => void; onPlay: () => void;
}) {
  return (
    <div className="rounded-xl overflow-hidden bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors group relative" onClick={onClick}>
      <div className="aspect-square">
        {coverTracks.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: folder.color + "22" }}>
            <FolderOpen size={36} style={{ color: folder.color }} />
          </div>
        ) : coverTracks.length === 1 ? (
          <img src={coverTracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="grid grid-cols-2 h-full">
            {coverTracks.slice(0, 4).map((t) => <img key={t.videoId} src={t.thumbnail} alt="" className="w-full h-full object-cover" />)}
          </div>
        )}
      </div>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onPlay(); }} className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"><Play size={10} className="text-white" /></button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"><Pencil size={10} className="text-white" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"><Trash2 size={10} className="text-white" /></button>
      </div>
      <div className="p-2.5">
        <p className="text-sm font-semibold truncate" style={{ color: folder.color }}>{folder.name}</p>
        <p className="text-xs text-on-surface-variant">{(folder.videoIds ?? []).length} song{(folder.videoIds ?? []).length !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

// ── Track item ────────────────────────────────────────────────────────────────
function cachedMetadataToTrack(metadata: CachedTrackMetadata): Track {
  return {
    id: metadata.videoId,
    videoId: metadata.videoId,
    title: metadata.title,
    artist: metadata.artist,
    artistId: metadata.artistId,
    album: metadata.album,
    albumId: metadata.albumId,
    thumbnail: metadata.thumbnail,
    thumbnailLarge: metadata.thumbnailLarge,
    duration: metadata.duration,
  };
}

function shuffleTracks(tracks: Track[]): Track[] {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function CachedTrackItem({ track, isSelected, onPlay, onSelect, onDelete, onAddToFolder, showCheckbox = true, onRemoveFromFolder }: {
  track: CachedTrackMetadata; isSelected: boolean;
  onPlay: () => void; onSelect: () => void; onDelete: () => void; onAddToFolder: () => void;
  showCheckbox?: boolean; onRemoveFromFolder?: () => void;
}) {
  const [renderedAt] = useState(() => Date.now());
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const playerStatus = usePlayerStore((state) => state.status);
  const isCurrentTrack = currentTrack?.videoId === track.videoId;
  const isPlaying = isCurrentTrack && playerStatus === "playing";
  const isLoading = isCurrentTrack && playerStatus === "loading";

  const formatDate = (ts: number) => {
    const d = Math.floor((renderedAt - ts) / 86400000);
    if (d === 0) return "Today";
    if (d === 1) return "Yesterday";
    if (d < 7) return `${d} days ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className={`group flex items-center gap-2 p-2 rounded-lg transition-colors ${
      isSelected
        ? "bg-primary/10"
        : isCurrentTrack
          ? "bg-surface-container"
          : "hover:bg-surface-container"
    }`}>
      {showCheckbox && (
        <button
          type="button"
          onClick={onSelect}
          aria-label={`${isSelected ? "Deselect" : "Select"} ${track.title}`}
          aria-pressed={isSelected}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${isSelected ? "bg-primary border-primary" : "border-on-surface-variant hover:border-primary"}`}
        >
          {isSelected && <CheckCircle2 size={14} className="text-on-primary" />}
        </button>
      )}

      <button
        type="button"
        onClick={onPlay}
        aria-label={isPlaying ? `${track.title} is playing` : `Play ${track.title} by ${track.artist}`}
        className="group/track flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-surface-container-high">
          {track.thumbnail ? (
            <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant text-[16px]">music_note</span>
            </div>
          )}
          <span className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
            isCurrentTrack ? "opacity-100" : "opacity-0 group-hover/track:opacity-100 group-focus-visible/track:opacity-100"
          }`} aria-hidden="true">
            {isLoading ? (
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-white text-[19px]">
                {isPlaying ? "equalizer" : "play_arrow"}
              </span>
            )}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate transition-colors ${isCurrentTrack ? "text-primary" : "group-hover/track:text-primary"}`}>
            {track.title}
          </p>
          <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
        </div>
        <div className="text-right text-xs text-on-surface-variant hidden sm:block tabular-nums">
          <p>{StorageManager.formatBytes(track.fileSize)}</p>
          <p>{formatDate(track.cachedAt)}</p>
        </div>
        {track.isManualDownload && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Downloaded</span>}
      </button>

      {/* Add to folder — always visible (no hover-only on mobile) */}
      <button
        type="button"
        onClick={onAddToFolder}
        className="p-1.5 rounded-full bg-surface-container hover:bg-surface-container-high active:bg-surface-container-high text-on-surface-variant hover:text-primary active:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title="Add to folder"
        aria-label={`Add ${track.title} to a folder`}
      >
        <FolderPlus size={15} />
      </button>
      {/* Remove from folder (inside folder view) */}
      {onRemoveFromFolder && (
        <button
          type="button"
          onClick={onRemoveFromFolder}
          className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-amber-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          title="Remove from this folder"
          aria-label={`Remove ${track.title} from this folder`}
        >
          <FolderX size={15} />
        </button>
      )}
      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 rounded-full hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title="Remove from cache"
        aria-label={`Remove ${track.title} from downloaded songs`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
