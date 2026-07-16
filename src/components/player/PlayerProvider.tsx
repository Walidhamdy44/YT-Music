"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { useQueueStore } from "@/stores/queueStore";
import type { Track } from "@/types";

// Global audio ref accessible from outside the component
let globalAudioRef: HTMLAudioElement | null = null;

export function getAudioElement(): HTMLAudioElement | null {
  return globalAudioRef;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryCount = useRef(0);
  const {
    currentTrack,
    status,
    volume,
    isMuted,
    repeatMode,
    streamInfo,
    setCurrentTime,
    setDuration,
    setStatus,
    setStreamInfo,
  } = usePlayerStore();
  const { next } = useQueueStore();

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
      globalAudioRef = audio;
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Stream URL changes
  useEffect(() => {
    if (!audioRef.current || !streamInfo?.url) return;
    const audio = audioRef.current;

    if (audio.src !== streamInfo.url) {
      audio.src = streamInfo.url;
      audio.load();
      retryCount.current = 0;
      audio.play().catch((err) => {
        console.warn("Autoplay blocked or failed:", err);
        // Don't set error for autoplay policy blocks
        if (err.name !== "NotAllowedError") {
          setStatus("error");
        }
      });
    }
  }, [streamInfo, setStatus]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => setStatus("playing");
    const onPause = () => {
      if (!audio.ended) setStatus("paused");
    };
    const onWaiting = () => setStatus("loading");
    const onPlaying = () => {
      setStatus("playing");
      retryCount.current = 0;
    };
    const onEnded = () => handleTrackEnd();
    const onError = () => handlePlaybackError();

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatMode]);

  const handleTrackEnd = useCallback(() => {
    const { repeatMode } = usePlayerStore.getState();
    if (repeatMode === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }

    const nextTrack = next();
    if (nextTrack) {
      playTrack(nextTrack, true); // skipRadio=true since we're playing from queue
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

  const handlePlaybackError = useCallback(async () => {
    const { currentTrack, streamInfo } = usePlayerStore.getState();

    // Stream expiration recovery - re-fetch and resume
    if (currentTrack && retryCount.current < 3) {
      retryCount.current++;
      const currentTime = audioRef.current?.currentTime || 0;

      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: currentTrack.videoId }),
        });

        if (res.ok) {
          const newStream = await res.json();
          usePlayerStore.getState().setStreamInfo(newStream);

          // Resume from position after new URL loads
          if (audioRef.current) {
            audioRef.current.addEventListener(
              "loadeddata",
              () => {
                if (audioRef.current && currentTime > 0) {
                  audioRef.current.currentTime = currentTime;
                  audioRef.current.play().catch(() => {});
                }
              },
              { once: true }
            );
          }
          return;
        }
      } catch {
        // Recovery failed
      }
    }

    usePlayerStore.getState().setStatus("error");
  }, []);

  // Play/pause sync from status store changes (user clicks)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !streamInfo?.url) return;

    if (status === "playing" && audio.paused && audio.src) {
      audio.play().catch(() => {});
    } else if (status === "paused" && !audio.paused) {
      audio.pause();
    }
  }, [status, streamInfo]);

  // Media Session API
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || "",
      artwork: currentTrack.thumbnail
        ? [{ src: currentTrack.thumbnailLarge || currentTrack.thumbnail, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      usePlayerStore.getState().setStatus("playing");
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      usePlayerStore.getState().setStatus("paused");
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
      }
    });
  }, [currentTrack]);

  return <>{children}</>;
}

// --- Exported utility functions for playback control ---

export async function playTrack(track: Track, skipRadio = false) {
  const { setCurrentTrack, setStatus, setStreamInfo, currentTrack, streamInfo } =
    usePlayerStore.getState();

  // Validate videoId before attempting extraction
  if (!track.videoId || !/^[a-zA-Z0-9_-]{11}$/.test(track.videoId)) {
    console.warn("Invalid videoId, skipping:", track.videoId);
    setStatus("error");
    return;
  }

  // If same track is already loaded and has a valid stream, just resume
  if (
    currentTrack?.videoId === track.videoId &&
    streamInfo?.url &&
    streamInfo.expiresAt > Date.now()
  ) {
    setStatus("playing");
    return;
  }

  setCurrentTrack(track);
  setStatus("loading");

  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: track.videoId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Extract failed:", err);
      setStatus("error");
      return;
    }

    const stream = await res.json();
    setStreamInfo(stream);

    if (stream.duration && stream.duration > 0) {
      usePlayerStore.getState().setDuration(stream.duration);
    }

    // Fetch radio queue (related songs) in the background
    // Only if queue has 2 or fewer upcoming tracks
    if (!skipRadio) {
      const queue = useQueueStore.getState();
      const upcomingCount = queue.tracks.length - queue.currentIndex - 1;
      if (upcomingCount <= 2) {
        fetchRadioQueue(track.videoId);
      }
    }
  } catch (err) {
    console.error("playTrack error:", err);
    setStatus("error");
  }
}

// Fetch related songs and add to queue (like YT Music's radio)
async function fetchRadioQueue(videoId: string) {
  try {
    const res = await fetch(`/api/radio?videoId=${videoId}`);
    if (!res.ok) return;

    const data = await res.json();
    const radioTracks: Track[] = data.tracks || [];

    if (radioTracks.length > 0) {
      const queue = useQueueStore.getState();
      // Add radio tracks to the end of the queue (avoid duplicates)
      const existingIds = new Set(queue.tracks.map((t) => t.videoId));
      const newTracks = radioTracks.filter((t) => !existingIds.has(t.videoId));

      newTracks.forEach((track) => {
        useQueueStore.getState().addToQueue(track);
      });
    }
  } catch {
    // Radio fetch is non-critical, ignore errors
  }
}

export function togglePlayback() {
  const { status, setStatus, streamInfo } = usePlayerStore.getState();

  if (!streamInfo) return;

  if (status === "playing") {
    setStatus("paused");
  } else if (status === "paused" || status === "error") {
    setStatus("playing");
  }
}

export function handleShuffle() {
  const { isShuffled, toggleShuffle } = usePlayerStore.getState();
  toggleShuffle();

  // If we just enabled shuffle, shuffle the queue
  if (!isShuffled) {
    useQueueStore.getState().shuffleQueue();
  }
}

export function seekTo(time: number) {
  const audio = globalAudioRef;
  if (audio && audio.src) {
    audio.currentTime = time;
    usePlayerStore.getState().setCurrentTime(time);
  }
}
