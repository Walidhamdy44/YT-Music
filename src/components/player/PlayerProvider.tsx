"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { useQueueStore } from "@/stores/queueStore";
import type { Track } from "@/types";

// Audio backend URL — set via env or defaults to localhost
const AUDIO_BACKEND_URL =
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL || "http://localhost:8000";

// Global audio element ref (persists across renders)
let audioElement: HTMLAudioElement | null = null;

export function getAudioElement(): HTMLAudioElement | null {
  return audioElement;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    currentTrack,
    status,
    volume,
    isMuted,
  } = usePlayerStore();
  const { next } = useQueueStore();

  // Store handleTrackEnd in a ref so callbacks always use latest version
  const handleTrackEndRef = useRef(() => {});

  // Initialize audio element once
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
      audioElement = audio;
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      if (Number.isFinite(time)) {
        usePlayerStore.getState().setCurrentTime(time);
      }
    };

    const handleDurationChange = () => {
      const dur = audio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        usePlayerStore.getState().setDuration(dur);
      }
    };

    const handlePlay = () => {
      usePlayerStore.getState().setStatus("playing");
    };

    const handlePause = () => {
      // Only set paused if we didn't just end
      const state = usePlayerStore.getState();
      if (state.status !== "idle") {
        usePlayerStore.getState().setStatus("paused");
      }
    };

    const handleEnded = () => {
      handleTrackEndRef.current();
    };

    const handleError = () => {
      const track = usePlayerStore.getState().currentTrack;
      if (!track) return;

      console.error("Audio playback error for:", track.videoId);
      // Auto-skip on error (region-restricted, unavailable, etc.)
      const nextTrack = useQueueStore.getState().next();
      if (nextTrack) {
        playTrack(nextTrack, true);
      } else {
        usePlayerStore.getState().setStatus("error");
      }
    };

    const handleWaiting = () => {
      usePlayerStore.getState().setStatus("loading");
    };

    const handleCanPlay = () => {
      const state = usePlayerStore.getState();
      if (state.status === "loading") {
        // Auto-play when ready if we initiated a play
        audio.play().catch(() => {});
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, []);

  // Handle track end (next/repeat logic)
  const handleTrackEnd = useCallback(() => {
    const { repeatMode } = usePlayerStore.getState();
    const audio = audioRef.current;

    if (repeatMode === "one" && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }

    const nextTrack = next();
    if (nextTrack) {
      playTrack(nextTrack, true);
    } else if (repeatMode === "all") {
      const queue = useQueueStore.getState();
      if (queue.tracks.length > 0) {
        useQueueStore.getState().skipTo(0);
        playTrack(queue.tracks[0], true);
      }
    } else {
      usePlayerStore.getState().setStatus("idle");
    }
  }, [next]);

  useEffect(() => {
    handleTrackEndRef.current = handleTrackEnd;
  }, [handleTrackEnd]);

  // Volume sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  // Play/pause sync — when status changes from external controls
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (status === "playing" && audio.paused) {
      audio.play().catch(() => {});
    } else if (status === "paused" && !audio.paused) {
      audio.pause();
    }
  }, [status]);

  // Media Session API — lock screen controls and background audio
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || "",
      artwork: currentTrack.thumbnail
        ? [
            { src: currentTrack.thumbnailLarge || currentTrack.thumbnail, sizes: "512x512", type: "image/jpeg" },
            { src: currentTrack.thumbnail, sizes: "96x96", type: "image/jpeg" },
          ]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      const prev = useQueueStore.getState().previous();
      if (prev) playTrack(prev);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const n = useQueueStore.getState().next();
      if (n) playTrack(n);
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (audioRef.current && details.seekTime != null) {
        audioRef.current.currentTime = details.seekTime;
        usePlayerStore.getState().setCurrentTime(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      if (audioRef.current) {
        const skipTime = details.seekOffset || 10;
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - skipTime);
      }
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      if (audioRef.current) {
        const skipTime = details.seekOffset || 10;
        const dur = audioRef.current.duration || 0;
        audioRef.current.currentTime = Math.min(dur, audioRef.current.currentTime + skipTime);
      }
    });
  }, [currentTrack]);

  // Update Media Session position state
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const { currentTime, duration } = usePlayerStore.getState();
    if (
      Number.isFinite(duration) &&
      duration > 0 &&
      Number.isFinite(currentTime) &&
      currentTime >= 0 &&
      currentTime <= duration
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: currentTime,
        });
      } catch {
        // Some browsers don't support setPositionState
      }
    }
  });

  // Set playback state on media session
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (status === "playing") {
      navigator.mediaSession.playbackState = "playing";
    } else if (status === "paused") {
      navigator.mediaSession.playbackState = "paused";
    } else {
      navigator.mediaSession.playbackState = "none";
    }
  }, [status]);

  return <>{children}</>;
}

// --- Exported utility functions for playback control ---

export async function playTrack(track: Track, skipRadio = false) {
  const { setCurrentTrack, setStatus, setDuration, currentTrack } =
    usePlayerStore.getState();

  // Validate videoId
  if (!track.videoId || !/^[a-zA-Z0-9_-]{11}$/.test(track.videoId)) {
    console.warn("Invalid videoId, skipping:", track.videoId);
    const nextTrack = useQueueStore.getState().next();
    if (nextTrack) playTrack(nextTrack, true);
    return;
  }

  // If same track and audio is just paused, resume
  if (currentTrack?.videoId === track.videoId && audioElement) {
    if (audioElement.paused && audioElement.src) {
      audioElement.play().catch(() => {});
      return;
    }
  }

  setCurrentTrack(track);
  setStatus("loading");
  setDuration(track.duration || 0);

  // Set audio source to our backend redirect endpoint
  if (audioElement) {
    const audioUrl = `${AUDIO_BACKEND_URL}/audio/${track.videoId}`;
    audioElement.src = audioUrl;
    audioElement.load();
    // Playback will start from the canplay handler
  }

  // Set streamInfo for UI compatibility
  usePlayerStore.getState().setStreamInfo({
    url: `${AUDIO_BACKEND_URL}/audio/${track.videoId}`,
    mimeType: "audio/mp4",
    bitrate: 128000,
    duration: track.duration || 0,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    videoId: track.videoId,
  });

  // Fetch radio queue in background
  if (!skipRadio) {
    const queue = useQueueStore.getState();
    const upcomingCount = queue.tracks.length - queue.currentIndex - 1;
    if (upcomingCount <= 2) {
      fetchRadioQueue(track.videoId);
    }
  }
}

// Fetch related songs and add to queue
async function fetchRadioQueue(videoId: string) {
  try {
    const res = await fetch(`/api/radio?videoId=${videoId}`);
    if (!res.ok) return;

    const data = await res.json();
    const radioTracks: Track[] = data.tracks || [];

    if (radioTracks.length > 0) {
      const queue = useQueueStore.getState();
      const existingIds = new Set(queue.tracks.map((t) => t.videoId));
      const newTracks = radioTracks.filter((t) => !existingIds.has(t.videoId));
      newTracks.forEach((track) => {
        useQueueStore.getState().addToQueue(track);
      });
    }
  } catch {
    // Non-critical
  }
}

export function togglePlayback() {
  const { status } = usePlayerStore.getState();

  if (!audioElement) return;

  if (status === "playing") {
    audioElement.pause();
  } else if (status === "paused" || status === "error") {
    audioElement.play().catch(() => {});
  }
}

export function handleShuffle() {
  const { isShuffled, toggleShuffle } = usePlayerStore.getState();
  toggleShuffle();

  if (!isShuffled) {
    useQueueStore.getState().shuffleQueue();
  }
}

export function seekTo(time: number) {
  if (audioElement) {
    audioElement.currentTime = time;
    usePlayerStore.getState().setCurrentTime(time);
  }
}
