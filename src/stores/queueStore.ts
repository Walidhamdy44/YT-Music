import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track } from "@/types";

interface QueueState {
  tracks: Track[];
  currentIndex: number;
  history: Track[];

  // Actions
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  next: () => Track | null;
  previous: () => Track | null;
  skipTo: (index: number) => Track | null;
  clearQueue: () => void;
  shuffleQueue: () => void;
}

export const useQueueStore = create<QueueState>()(
  persist(
    (set, get) => ({
      tracks: [],
      currentIndex: -1,
      history: [],

      setQueue: (tracks, startIndex = 0) =>
        set({ tracks, currentIndex: startIndex, history: [] }),

      addToQueue: (track) =>
        set((state) => ({ tracks: [...state.tracks, track] })),

      playNext: (track) =>
        set((state) => {
          const newTracks = [...state.tracks];
          newTracks.splice(state.currentIndex + 1, 0, track);
          return { tracks: newTracks };
        }),

      removeFromQueue: (index) =>
        set((state) => {
          const newTracks = [...state.tracks];
          newTracks.splice(index, 1);
          let newIndex = state.currentIndex;
          if (index < state.currentIndex) {
            newIndex--;
          } else if (index === state.currentIndex) {
            newIndex = Math.min(newIndex, newTracks.length - 1);
          }
          return { tracks: newTracks, currentIndex: newIndex };
        }),

      reorder: (fromIndex, toIndex) =>
        set((state) => {
          const newTracks = [...state.tracks];
          const [moved] = newTracks.splice(fromIndex, 1);
          newTracks.splice(toIndex, 0, moved);
          let newIndex = state.currentIndex;
          if (fromIndex === state.currentIndex) {
            newIndex = toIndex;
          } else if (
            fromIndex < state.currentIndex &&
            toIndex >= state.currentIndex
          ) {
            newIndex--;
          } else if (
            fromIndex > state.currentIndex &&
            toIndex <= state.currentIndex
          ) {
            newIndex++;
          }
          return { tracks: newTracks, currentIndex: newIndex };
        }),

      next: () => {
        const state = get();
        if (state.currentIndex < state.tracks.length - 1) {
          const nextIndex = state.currentIndex + 1;
          const currentTrack = state.tracks[state.currentIndex];
          set({
            currentIndex: nextIndex,
            history: currentTrack
              ? [...state.history, currentTrack]
              : state.history,
          });
          return state.tracks[nextIndex];
        }
        return null;
      },

      previous: () => {
        const state = get();
        if (state.currentIndex > 0) {
          const prevIndex = state.currentIndex - 1;
          set({ currentIndex: prevIndex });
          return state.tracks[prevIndex];
        }
        return null;
      },

      skipTo: (index) => {
        const state = get();
        if (index >= 0 && index < state.tracks.length) {
          set({ currentIndex: index });
          return state.tracks[index];
        }
        return null;
      },

      clearQueue: () => set({ tracks: [], currentIndex: -1, history: [] }),

      shuffleQueue: () =>
        set((state) => {
          const currentTrack = state.tracks[state.currentIndex];
          const otherTracks = state.tracks.filter(
            (_, i) => i !== state.currentIndex
          );
          // Fisher-Yates shuffle
          for (let i = otherTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
          }
          return {
            tracks: currentTrack ? [currentTrack, ...otherTracks] : otherTracks,
            currentIndex: 0,
          };
        }),
    }),
    {
      name: "ytmusic-queue",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
