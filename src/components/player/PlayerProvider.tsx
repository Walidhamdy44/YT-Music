"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { useQueueStore } from "@/stores/queueStore";
import { useOfflineStore } from "@/stores/offlineStore";
import { offlinePlaybackService } from "@/lib/offlinePlaybackService";
import { savedUrlStore } from "@/lib/savedUrlStore";
import { CacheMetadataStore } from "@/lib/cacheMetadataStore";
import type { Track } from "@/types";

// Audio backend URL — use local API proxy to bypass ngrok warning
const AUDIO_BACKEND_URL = "/api";
const DOWNLOAD_BACKEND_URL = "/api/download";

// Track the current blob URL to revoke when changing tracks
let currentBlobUrl: string | null = null;

// Global audio element ref (persists across renders)
let audioElement: HTMLAudioElement | null = null;
// Track if we're seeking (to prevent loading state during seeks)
let isSeeking = false;
// Track retry attempts for iOS
let playRetryCount = 0;
const MAX_PLAY_RETRIES = 3;
// Flag: set to true when 'ended' fires so the subsequent 'pause' event
// does NOT flip status to "paused" (which would tell iOS the session is dead
// and cause the notification-center Next button to stop responding).
let isAutoAdvancing = false;

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

  // Initialize offline playback service
  useEffect(() => {
    initializeOfflinePlayback();
  }, []);

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
      // Also check duration in case it wasn't set before
      const dur = audio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const stored = usePlayerStore.getState().duration;
        if (stored !== dur) {
          usePlayerStore.getState().setDuration(dur);
        }
      }
    };

    const handleDurationChange = () => {
      const dur = audio.duration;
      console.log("[PlayerProvider] Duration changed:", dur);
      if (Number.isFinite(dur) && dur > 0) {
        usePlayerStore.getState().setDuration(dur);
      }
    };

    const handlePlay = () => {
      usePlayerStore.getState().setStatus("playing");
    };

    const handlePause = () => {
      // If we're auto-advancing to the next track (song ended naturally),
      // skip setting "paused" — that would set playbackState="paused" on the
      // MediaSession and iOS would ignore notification-center Next button taps
      // during the entire async transition to the next song.
      if (isAutoAdvancing) return;

      const state = usePlayerStore.getState();
      if (state.status !== "idle") {
        usePlayerStore.getState().setStatus("paused");
      }
    };

    const handleEnded = () => {
      console.log("[PlayerProvider] Track ended, triggering next...");
      // Raise the flag BEFORE the browser fires its follow-up 'pause' event
      // so handlePause knows to skip the "paused" status transition.
      isAutoAdvancing = true;
      // Keep MediaSession in "playing" state so iOS keeps the Next button live.
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      // Call synchronously — any delay (even setTimeout 0) burns iOS's
      // auto-advance grace period before playTrack can call play().
      handleTrackEndRef.current();
    };

    const handleError = (e: Event) => {
      const track = usePlayerStore.getState().currentTrack;
      if (!track) return;

      const audio = e.target as HTMLAudioElement;
      const error = audio.error;
      
      // Detailed error logging for debugging
      console.error("[Audio Error]", {
        videoId: track.videoId,
        errorCode: error?.code,
        errorMessage: error?.message,
        networkState: audio.networkState,
        readyState: audio.readyState,
        src: audio.src,
      });
      
      // Error codes:
      // 1 = MEDIA_ERR_ABORTED
      // 2 = MEDIA_ERR_NETWORK  
      // 3 = MEDIA_ERR_DECODE
      // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
      
      // On iOS/mobile, retry a few times (could be ngrok interstitial or network issue)
      if (playRetryCount < MAX_PLAY_RETRIES) {
        playRetryCount++;
        console.log(`[Audio] Retrying playback (attempt ${playRetryCount}/${MAX_PLAY_RETRIES})...`);
        setTimeout(() => {
          if (audioElement && track.videoId) {
            audioElement.load();
            audioElement.play().catch((playError) => {
              console.error("[Audio] Play retry failed:", playError);
            });
          }
        }, 1000 * playRetryCount); // Increasing delay
        return;
      }
      
      // Reset retry count
      playRetryCount = 0;
      
      // Auto-skip on persistent error
      const nextTrack = useQueueStore.getState().next();
      if (nextTrack) {
        console.log("[Audio] Skipping to next track after error");
        playTrack(nextTrack, true);
      } else {
        usePlayerStore.getState().setStatus("error");
      }
    };

    const handleWaiting = () => {
      // Only show loading if we're not seeking (seeking has its own UI state)
      if (!isSeeking) {
        usePlayerStore.getState().setStatus("loading");
      }
    };

    const handleCanPlay = () => {
      const state = usePlayerStore.getState();
      isSeeking = false; // Reset seeking flag
      if (state.status === "loading") {
        // Auto-play when ready if we initiated a play
        audio.play().catch((err) => {
          // On iOS in background, play() will be blocked with NotAllowedError.
          // When this happens we MUST flip to "paused" so iOS shows the Play
          // button in the notification center — otherwise the user sees the
          // next track's title but hears nothing and has no way to resume
          // without opening the app.
          console.log("[PlayerProvider] canplay play() blocked:", err?.name);
          if (err?.name === "NotAllowedError" || err?.name === "NotSupportedError") {
            usePlayerStore.getState().setStatus("paused");
            if ("mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "paused";
            }
          }
        });
      }
    };

    // Fires when playback actually starts (after buffering)
    const handlePlaying = () => {
      usePlayerStore.getState().setStatus("playing");
    };

    const handleSeeking = () => {
      isSeeking = true;
    };

    const handleSeeked = () => {
      isSeeking = false;
      // Ensure we're in playing state after seek completes
      const state = usePlayerStore.getState();
      if (state.status === "loading" && !audio.paused) {
        usePlayerStore.getState().setStatus("playing");
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("seeking", handleSeeking);
    audio.addEventListener("seeked", handleSeeked);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("seeking", handleSeeking);
      audio.removeEventListener("seeked", handleSeeked);
    };
  }, []);

  // Handle track end (next/repeat logic)
  const handleTrackEnd = useCallback(() => {
    console.log("[PlayerProvider] handleTrackEnd called");
    const { repeatMode } = usePlayerStore.getState();
    const audio = audioRef.current;

    if (repeatMode === "one" && audio) {
      console.log("[PlayerProvider] Repeat one - restarting track");
      audio.currentTime = 0;
      audio.play().catch((e) => console.error("[PlayerProvider] Repeat play failed:", e));
      return;
    }

    const nextTrack = next();
    if (nextTrack) {
      console.log("[PlayerProvider] Playing next track:", nextTrack.title);
      // Call playTrack synchronously (no setTimeout) so the pre-src play()
      // inside playTrack fires within iOS's auto-advance grace period.
      playTrack(nextTrack, true);
    } else if (repeatMode === "all") {
      console.log("[PlayerProvider] Repeat all - restarting queue");
      const queue = useQueueStore.getState();
      if (queue.tracks.length > 0) {
        useQueueStore.getState().skipTo(0);
        playTrack(queue.tracks[0], true);
      }
    } else {
      console.log("[PlayerProvider] Queue ended");
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

    // Play/Pause handlers
    navigator.mediaSession.setActionHandler("play", () => {
      console.log("[MediaSession] Play triggered");
      const audio = audioRef.current;
      if (!audio) return;
      audio.play().then(() => {
        usePlayerStore.getState().setStatus("playing");
        navigator.mediaSession.playbackState = "playing";
      }).catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      console.log("[MediaSession] Pause triggered");
      audioRef.current?.pause();
    });
    
    // Previous/Next track handlers - REGISTER FIRST for iOS priority
    // iOS shows these in Control Center when swiped up
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      console.log("[MediaSession] Previous track triggered");
      const prev = useQueueStore.getState().previous();
      if (prev) {
        playTrack(prev, true);
      } else {
        // If no previous, restart current track
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      }
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      console.log("[MediaSession] Next track triggered");
      // If we're already auto-advancing (song just ended and we're loading the
      // next track), ignore the tap — handleTrackEnd already called next() and
      // a second call would skip an extra song.
      if (isAutoAdvancing) {
        console.log("[MediaSession] Next ignored — auto-advance already in progress");
        return;
      }
      const n = useQueueStore.getState().next();
      if (n) {
        playTrack(n, true);
      }
    });
    
    // Seek handlers - iOS shows these on lock screen compact view
    // Remove seekbackward/seekforward to force iOS to show prev/next instead
    // Note: Keeping seekto for scrubber functionality
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (audioRef.current && details.seekTime != null) {
        console.log("[MediaSession] Seek to:", details.seekTime);
        audioRef.current.currentTime = details.seekTime;
        usePlayerStore.getState().setCurrentTime(details.seekTime);
      }
    });
    
    // Set seekbackward/seekforward to null to remove -10/+10 buttons
    // This should make iOS show previoustrack/nexttrack instead
    navigator.mediaSession.setActionHandler("seekbackward", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    
    // Stop handler (some platforms use this)
    try {
      navigator.mediaSession.setActionHandler("stop", () => {
        console.log("[MediaSession] Stop triggered");
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        usePlayerStore.getState().setStatus("idle");
      });
    } catch {
      // Not all browsers support stop
    }
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

/**
 * Initialize offline playback system
 */
async function initializeOfflinePlayback() {
  // Set online/offline state IMMEDIATELY before any async ops
  useOfflineStore.getState().setOffline(!navigator.onLine);
  
  // Always mark as initialized — button should work even if cache fails
  // Errors will surface naturally during the download attempt
  useOfflineStore.getState().setInitialized(true);

  // Register online/offline listeners
  window.addEventListener('online', () => {
    console.log('[OfflinePlayback] Network: online');
    useOfflineStore.getState().setOffline(false);
  });
  window.addEventListener('offline', () => {
    console.log('[OfflinePlayback] Network: offline');
    useOfflineStore.getState().setOffline(true);
  });

  try {
    await offlinePlaybackService.init();
    const cachedTracks = await offlinePlaybackService.getCachedTracks();
    useOfflineStore.getState().setCachedTracks(cachedTracks);
    console.log(`[OfflinePlayback] Initialized with ${cachedTracks.length} cached tracks`);
  } catch (e) {
    console.warn('[OfflinePlayback] Initialization failed (non-fatal):', e);
  }
}

export async function playTrack(track: Track, skipRadio = false) {
  const { setCurrentTrack, setStatus, setDuration, currentTrack } =
    usePlayerStore.getState();

  console.log("[playTrack] Starting:", track.videoId, track.title);

  // Clear the auto-advance flag. Do this synchronously before any await so
  // manual pauses during the loading phase are handled normally.
  isAutoAdvancing = false;

  // Keep MediaSession active immediately — iOS needs this to stay "playing"
  // so the notification center controls remain live.
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "playing";
  }

  // Validate videoId
  if (!track.videoId || !/^[a-zA-Z0-9_-]{11}$/.test(track.videoId)) {
    console.warn("[playTrack] Invalid videoId, skipping:", track.videoId);
    const nextTrack = useQueueStore.getState().next();
    if (nextTrack) playTrack(nextTrack, true);
    return;
  }

  // If same track and audio is just paused, resume
  if (currentTrack?.videoId === track.videoId && audioElement) {
    if (audioElement.paused && audioElement.src) {
      console.log("[playTrack] Resuming paused track");
      audioElement.play().catch((e) => console.error("[playTrack] Resume failed:", e));
      return;
    }
  }

  // Reset retry count for new track
  playRetryCount = 0;

  // Revoke previous blob URL if exists
  if (currentBlobUrl) {
    offlinePlaybackService.revokeBlobUrl(currentBlobUrl);
    currentBlobUrl = null;
  }

  setCurrentTrack(track);
  setStatus("loading");
  setDuration(track.duration || 0);

  // --- iOS Background Audio: Register play intent BEFORE async work ---
  //
  // iOS grants a very short "auto-advance grace period" right after 'ended'.
  // Any await (IndexedDB, Cache API) burns through that window. By the time
  // the URL is resolved and we call play(), iOS accepts the call without
  // throwing NotAllowedError — but the AVAudioSession was never re-activated,
  // so the audio pipeline is silently suspended: the UI shows "playing",
  // the MediaSession shows the new track, but no sound comes out.
  //
  // The fix: call play() on a blank src immediately (within the same
  // synchronous call stack as 'ended'), then swap the src in after. iOS
  // keeps the AVAudioSession alive for the element that already has an
  // active play() promise, and resumes output when the src is loaded.
  let playPromise: Promise<void> | null = null;
  if (audioElement) {
    // Calling play() on an element with no src returns a pending promise on
    // iOS — it does NOT throw. We catch the AbortError that fires when we
    // later assign src + load(), which is expected and harmless.
    playPromise = audioElement.play().catch((e) => {
      // AbortError is expected here: play() was interrupted by the src change.
      // Any other error is worth logging.
      if (e?.name !== "AbortError") {
        console.log("[playTrack] Pre-src play() rejected:", e?.name);
      }
    });
  }

  // --- Resolve audio URL (async work happens here) ---
  let audioUrl: string;
  let isFromCache = false;

  try {
    const audioSource = await offlinePlaybackService.getAudioUrl(track.videoId);
    audioUrl = audioSource.url;
    isFromCache = audioSource.isFromCache;
    
    if (isFromCache) {
      currentBlobUrl = audioUrl; // Track for cleanup
      console.log("[playTrack] Playing from cache:", track.videoId);
    } else {
      // Check for a saved direct URL before falling back to the backend proxy
      const savedUrl = await savedUrlStore.getValidUrl(track.videoId);
      if (savedUrl) {
        audioUrl = savedUrl;
        console.log("[playTrack] Playing from saved URL (direct CDN):", track.videoId);
      } else {
        console.log("[playTrack] Playing from network proxy:", track.videoId);
      }
    }
  } catch (e) {
    // Fallback to network URL
    audioUrl = `${AUDIO_BACKEND_URL}/audio/${track.videoId}`;
    console.log("[playTrack] Cache check failed, using network:", track.videoId);
  }

  // Check if offline and not cached
  const isOffline = !navigator.onLine;
  if (isOffline && !isFromCache) {
    console.warn("[playTrack] Offline and not cached, cannot play:", track.videoId);
    setStatus("error");
    const nextTrack = useQueueStore.getState().next();
    if (nextTrack) {
      setTimeout(() => playTrack(nextTrack, true), 500);
    }
    return;
  }

  // --- Assign src and start real playback ---
  if (audioElement) {
    console.log("[playTrack] Setting src:", audioUrl.substring(0, 50) + "...");

    // Wait for the pre-src play() promise to settle before we interrupt it,
    // otherwise iOS can get into a bad state with two overlapping play cycles.
    if (playPromise) await playPromise;

    audioElement.src = audioUrl;
    audioElement.load();

    // Now call play() for real. By this point iOS has kept the AVAudioSession
    // alive (the earlier play() held it), so this should activate audio output.
    audioElement.play().catch((e) => {
      console.log("[playTrack] play() after src set rejected:", e?.name);
      if (e?.name === "NotAllowedError") {
        // Truly blocked — surface as paused so user can tap Play
        usePlayerStore.getState().setStatus("paused");
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
      }
      // AbortError from a fast subsequent track change is harmless
    });
  }

  // Set streamInfo for UI compatibility
  usePlayerStore.getState().setStreamInfo({
    url: audioUrl,
    mimeType: "audio/mp4",
    bitrate: 128000,
    duration: track.duration || 0,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    videoId: track.videoId,
  });

  // If played from network, cache in background after a delay
  if (!isFromCache && !isOffline) {
    cacheAudioInBackground(track);
  }

  // Fetch radio queue in background
  if (!skipRadio && !isOffline) {
    const queue = useQueueStore.getState();
    const upcomingCount = queue.tracks.length - queue.currentIndex - 1;
    if (upcomingCount <= 2) {
      fetchRadioQueue(track.videoId);
    }
  }
}

/**
 * Cache audio in background after successful playback start
 */
async function cacheAudioInBackground(track: Track) {
  // Wait a bit to ensure playback started successfully
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check if we're still playing this track
  const currentTrack = usePlayerStore.getState().currentTrack;
  if (currentTrack?.videoId !== track.videoId) {
    return; // User switched tracks, don't cache
  }

  // Check if already cached
  const isCached = useOfflineStore.getState().isTrackCached(track.videoId);
  if (isCached) {
    return;
  }

  try {
    console.log("[playTrack] Caching in background:", track.videoId);
    
    // Use the dedicated download endpoint for better reliability
    const response = await fetch(`${DOWNLOAD_BACKEND_URL}/${track.videoId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const audioBlob = await response.blob();
    console.log(`[playTrack] Background download received: ${audioBlob.size} bytes`);
    
    // Cache it
    const success = await offlinePlaybackService.cachePlayedAudio(track, audioBlob);
    
    if (success) {
      // Update store
      const metadata = CacheMetadataStore.createMetadata(track, audioBlob.size, false);
      useOfflineStore.getState().addCachedTrack(metadata);
      console.log("[playTrack] Background cache complete:", track.videoId);
    }
  } catch (e) {
    console.warn("[playTrack] Background caching failed:", e);
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
    isSeeking = true;
    audioElement.currentTime = time;
    usePlayerStore.getState().setCurrentTime(time);
  }
}
