"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { useQueueStore } from "@/stores/queueStore";
import type { Track } from "@/types";

// Global YouTube player ref
let ytPlayer: YT.Player | null = null;
let ytReady = false;
let timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

// YouTube IFrame API types
declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function getAudioElement(): HTMLAudioElement | null {
  // Legacy compat — not used with iframe approach
  return null;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const {
    currentTrack,
    status,
    volume,
    isMuted,
    repeatMode,
    setCurrentTime,
    setDuration,
    setStatus,
  } = usePlayerStore();
  const { next } = useQueueStore();

  // Load YouTube IFrame API script
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      ytReady = true;
      initPlayer();
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      ytReady = true;
      initPlayer();
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    };
  }, []);

  function initPlayer() {
    if (ytPlayer || !playerContainerRef.current) return;

    ytPlayer = new window.YT.Player("yt-iframe-player", {
      height: "0",
      width: "0",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  }

  function onPlayerReady() {
    if (!ytPlayer) return;
    const vol = usePlayerStore.getState().volume;
    const muted = usePlayerStore.getState().isMuted;
    ytPlayer.setVolume(muted ? 0 : vol * 100);

    // Start time update polling
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    timeUpdateInterval = setInterval(() => {
      if (!ytPlayer) return;
      const state = ytPlayer.getPlayerState();
      if (state === window.YT.PlayerState.PLAYING) {
        const time = ytPlayer.getCurrentTime();
        usePlayerStore.getState().setCurrentTime(time);
      }
    }, 250);
  }

  function onPlayerStateChange(event: YT.OnStateChangeEvent) {
    const { setStatus, setDuration } = usePlayerStore.getState();

    switch (event.data) {
      case window.YT.PlayerState.PLAYING:
        setStatus("playing");
        // Update duration once we know it
        if (ytPlayer) {
          const dur = ytPlayer.getDuration();
          if (dur > 0) setDuration(dur);
        }
        break;
      case window.YT.PlayerState.PAUSED:
        setStatus("paused");
        break;
      case window.YT.PlayerState.BUFFERING:
        setStatus("loading");
        break;
      case window.YT.PlayerState.ENDED:
        handleTrackEndRef.current();
        break;
      case window.YT.PlayerState.UNSTARTED:
        break;
    }
  }

  function onPlayerError(event: YT.OnErrorEvent) {
    console.error("YT Player error:", event.data);
    // Error codes: 2=invalid param, 5=HTML5 error, 100=not found, 101/150=restricted
    const code = event.data;
    if (code === 100 || code === 101 || code === 150) {
      // Video not available — skip to next
      const nextTrack = useQueueStore.getState().next();
      if (nextTrack) {
        playTrack(nextTrack, true);
      } else {
        usePlayerStore.getState().setStatus("idle");
      }
    } else {
      usePlayerStore.getState().setStatus("error");
    }
  }

  // Store handleTrackEnd in a ref so the YT callback always uses latest version
  const handleTrackEndRef = useRef(() => {});
  
  const handleTrackEnd = useCallback(() => {
    const { repeatMode } = usePlayerStore.getState();
    if (repeatMode === "one") {
      if (ytPlayer) {
        ytPlayer.seekTo(0, true);
        ytPlayer.playVideo();
      }
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

  handleTrackEndRef.current = handleTrackEnd;

  // Volume sync
  useEffect(() => {
    if (!ytPlayer) return;
    try {
      if (isMuted) {
        ytPlayer.mute();
      } else {
        ytPlayer.unMute();
        ytPlayer.setVolume(volume * 100);
      }
    } catch {
      // Player might not be ready yet
    }
  }, [volume, isMuted]);

  // Play/pause sync
  useEffect(() => {
    if (!ytPlayer) return;
    try {
      const playerState = ytPlayer.getPlayerState();
      if (status === "playing" && playerState !== window.YT.PlayerState.PLAYING) {
        ytPlayer.playVideo();
      } else if (status === "paused" && playerState === window.YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
      }
    } catch {
      // Player might not be ready
    }
  }, [status]);

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
      if (ytPlayer && details.seekTime != null) {
        ytPlayer.seekTo(details.seekTime, true);
      }
    });
  }, [currentTrack]);

  return (
    <>
      {/* Hidden YouTube IFrame player */}
      <div
        ref={playerContainerRef}
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
      >
        <div id="yt-iframe-player" />
      </div>
      {children}
    </>
  );
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

  // If same track, just resume
  if (currentTrack?.videoId === track.videoId && ytPlayer) {
    const state = ytPlayer.getPlayerState();
    if (state === window.YT.PlayerState.PAUSED) {
      ytPlayer.playVideo();
      return;
    }
  }

  setCurrentTrack(track);
  setStatus("loading");
  setDuration(track.duration || 0);

  // Wait for YT player to be ready
  if (!ytPlayer || !ytReady) {
    // Retry after a short delay
    setTimeout(() => {
      if (ytPlayer) {
        loadVideoInPlayer(track.videoId);
      }
    }, 1000);
  } else {
    loadVideoInPlayer(track.videoId);
  }

  // Set streamInfo for UI compatibility (mini player, etc.)
  usePlayerStore.getState().setStreamInfo({
    url: `https://music.youtube.com/watch?v=${track.videoId}`,
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

function loadVideoInPlayer(videoId: string) {
  if (!ytPlayer) return;
  try {
    ytPlayer.loadVideoById({
      videoId,
      startSeconds: 0,
    });
  } catch (err) {
    console.error("Failed to load video:", err);
    usePlayerStore.getState().setStatus("error");
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
  const { status, setStatus } = usePlayerStore.getState();

  if (!ytPlayer) return;

  if (status === "playing") {
    ytPlayer.pauseVideo();
  } else if (status === "paused" || status === "error") {
    ytPlayer.playVideo();
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
  if (ytPlayer) {
    ytPlayer.seekTo(time, true);
    usePlayerStore.getState().setCurrentTime(time);
  }
}
