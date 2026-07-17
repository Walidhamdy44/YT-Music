import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Playlist, Track } from "@/types";

interface LibraryState {
  playlists: Playlist[];
  likedTracks: Track[];
  savedTracks: Track[];

  // Actions
  createPlaylist: (title: string, description?: string) => Playlist;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, title: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderPlaylistTracks: (
    playlistId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  toggleLikeTrack: (track: Track) => void;
  isTrackLiked: (trackId: string) => boolean;
  toggleSaveTrack: (track: Track) => void;
  isTrackSaved: (trackId: string) => boolean;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      playlists: [],
      likedTracks: [],
      savedTracks: [],

      createPlaylist: (title, description) => {
        const newPlaylist: Playlist = {
          id: `local-${Date.now()}`,
          title,
          description,
          thumbnail: "",
          trackCount: 0,
          tracks: [],
          isLocal: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ playlists: [...state.playlists, newPlaylist] }));
        return newPlaylist;
      },

      deletePlaylist: (id) =>
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== id),
        })),

      renamePlaylist: (id, title) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === id ? { ...p, title, updatedAt: Date.now() } : p
          ),
        })),

      addTrackToPlaylist: (playlistId, track) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  tracks: [...p.tracks, track],
                  trackCount: p.trackCount + 1,
                  thumbnail: p.thumbnail || track.thumbnail,
                  updatedAt: Date.now(),
                }
              : p
          ),
        })),

      removeTrackFromPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  tracks: p.tracks.filter((t) => t.id !== trackId),
                  trackCount: p.trackCount - 1,
                  updatedAt: Date.now(),
                }
              : p
          ),
        })),

      reorderPlaylistTracks: (playlistId, fromIndex, toIndex) =>
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const newTracks = [...p.tracks];
            const [moved] = newTracks.splice(fromIndex, 1);
            newTracks.splice(toIndex, 0, moved);
            return { ...p, tracks: newTracks, updatedAt: Date.now() };
          }),
        })),

      toggleLikeTrack: (track) =>
        set((state) => {
          const isLiked = state.likedTracks.some((t) => t.id === track.id);
          return {
            likedTracks: isLiked
              ? state.likedTracks.filter((t) => t.id !== track.id)
              : [...state.likedTracks, track],
          };
        }),

      isTrackLiked: (trackId) => {
        return get().likedTracks.some((t) => t.id === trackId);
      },

      toggleSaveTrack: (track) =>
        set((state) => {
          const isSaved = state.savedTracks.some((t) => t.videoId === track.videoId);
          return {
            savedTracks: isSaved
              ? state.savedTracks.filter((t) => t.videoId !== track.videoId)
              : [track, ...state.savedTracks],
          };
        }),

      isTrackSaved: (trackId) => {
        return get().savedTracks.some((t) => t.videoId === trackId || t.id === trackId);
      },
    }),
    {
      name: "ytmusic-library",
    }
  )
);
