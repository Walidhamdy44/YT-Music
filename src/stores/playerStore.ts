import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track, PlayerStatus, RepeatMode, StreamInfo } from "@/types";

interface PlayerState {
  // Playback state
  currentTrack: Track | null;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  streamInfo: StreamInfo | null;

  // Actions
  setCurrentTrack: (track: Track | null) => void;
  setStatus: (status: PlayerStatus) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  setStreamInfo: (info: StreamInfo | null) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      currentTrack: null,
      status: "idle",
      currentTime: 0,
      duration: 0,
      volume: 0.7,
      isMuted: false,
      isShuffled: false,
      repeatMode: "none",
      streamInfo: null,

      setCurrentTrack: (track) => set({ currentTrack: track }),
      setStatus: (status) => set({ status }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
      toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),
      cycleRepeatMode: () =>
        set((state) => {
          const modes: RepeatMode[] = ["none", "all", "one"];
          const currentIndex = modes.indexOf(state.repeatMode);
          return { repeatMode: modes[(currentIndex + 1) % modes.length] };
        }),
      setStreamInfo: (info) => set({ streamInfo: info }),
      reset: () =>
        set({
          currentTrack: null,
          status: "idle",
          currentTime: 0,
          duration: 0,
          streamInfo: null,
        }),
    }),
    {
      name: "ytmusic-player",
      // Only persist these fields (not status, currentTime which are transient)
      partialize: (state) => ({
        currentTrack: state.currentTrack,
        volume: state.volume,
        isMuted: state.isMuted,
        isShuffled: state.isShuffled,
        repeatMode: state.repeatMode,
        duration: state.duration,
        // Don't persist: status, currentTime, streamInfo (these are session-only)
      }),
    }
  )
);
