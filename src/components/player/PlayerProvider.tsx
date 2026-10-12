"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { useUIStore } from "@/stores/uiStore";
import { useQueueStore } from "@/stores/queueStore";
import { useOfflineStore } from "@/stores/offlineStore";
import { offlinePlaybackService } from "@/lib/offlinePlaybackService";
import { savedUrlStore } from "@/lib/savedUrlStore";
import { CacheMetadataStore } from "@/lib/cacheMetadataStore";
import { scheduleSleepTimer } from "@/lib/sleepTimer";
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
// Monotonically identifies source changes so stale async lookups/play promises
// cannot take control after the user (or the queue) has selected another track.
let trackRequestId = 0;
// Track retry attempts for iOS
let playRetryCount = 0;
const MAX_PLAY_RETRIES = 3;
// Tracks the interval between an automatic source handoff and confirmed audio
// output. Natural completion itself is identified with audio.ended because the
// HTML media algorithm dispatches `pause` before `ended`.
let isAutoAdvancing = false;

interface ResolvedAudioSource {
  url: string;
  isFromCache: boolean;
}

// iOS can suspend the PWA as soon as the current media activity ends. Cached
// sources therefore have to be resolved while the current song is still
// playing; doing an IndexedDB/Cache API lookup from `ended` is already too late.
let preparedNextSource: (ResolvedAudioSource & { videoId: string }) | null = null;

export function getAudioElement(): HTMLAudioElement | null {
  return audioElement;
}

function expireSleepTimerIfNeeded(): boolean {
  const player = usePlayerStore.getState();
  if (player.sleepTimerEndsAt == null || Date.now() < player.sleepTimerEndsAt) return false;
  // Invalidate pending source lookups and error retries as well as active audio.
  trackRequestId++;
  isAutoAdvancing = false;
  audioElement?.pause();
  player.setStatus(player.currentTrack ? "paused" : "idle");
  player.setSleepTimer(null);
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  return true;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    currentTrack,
    status,
    volume,
    isMuted,
    repeatMode,
    sleepTimerEndsAt,
  } = usePlayerStore();
  const { next, tracks: queueTracks, currentIndex: queueIndex } = useQueueStore();
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
      if (expireSleepTimerIfNeeded()) return;
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

    const handlePause = () => {
      // The HTML media algorithm fires `pause` before `ended` on natural
      // completion. `isAutoAdvancing` is therefore not set yet; audio.ended is
      // the authoritative way to distinguish that pause from a user pause.
      if (isAutoAdvancing || audio.ended) return;

      const state = usePlayerStore.getState();
      if (state.status !== "idle") {
        usePlayerStore.getState().setStatus("paused");
      }
    };

    const handleEnded = () => {
      if (expireSleepTimerIfNeeded()) return;
      console.log("[PlayerProvider] Track ended, triggering next...");
      // Keep user/media-control pauses distinct while the new source starts.
      isAutoAdvancing = true;
      // This must stay synchronous. On iOS a background PWA may be suspended
      // as soon as this media-event task returns, so timers or source lookups
      // here strand the next track in a visual-only "playing" state.
      handleTrackEndRef.current();
    };

    const handleError = (e: Event) => {
      const audio = e.target as HTMLAudioElement;
      if (expireSleepTimerIfNeeded()) return;
      if (audio.paused && usePlayerStore.getState().status === "paused") return;
      const track = usePlayerStore.getState().currentTrack;
      if (!track) return;

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
        const requestId = trackRequestId;
        playRetryCount++;
        console.log(`[Audio] Retrying playback (attempt ${playRetryCount}/${MAX_PLAY_RETRIES})...`);
        setTimeout(() => {
          if (requestId !== trackRequestId || expireSleepTimerIfNeeded()) return;
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
      if (audio.paused && usePlayerStore.getState().status === "paused") return;
      // Only show loading if we're not seeking (seeking has its own UI state)
      if (!isSeeking) {
        usePlayerStore.getState().setStatus("loading");
      }
    };

    const handleCanPlay = () => {
      isSeeking = false; // Reset seeking flag
    };

    // Fires when playback actually starts (after buffering)
    const handlePlaying = () => {
      if (expireSleepTimerIfNeeded()) return;
      isAutoAdvancing = false;
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

  useEffect(() => {
    if (sleepTimerEndsAt == null) return;
    const cancel = scheduleSleepTimer(sleepTimerEndsAt, expireSleepTimerIfNeeded);
    const check = () => { expireSleepTimerIfNeeded(); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    return () => {
      cancel();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
    };
  }, [sleepTimerEndsAt]);

  // Handle track end (next/repeat logic)
  const handleTrackEnd = useCallback(() => {
    if (expireSleepTimerIfNeeded()) return;
    console.log("[PlayerProvider] handleTrackEnd called");
    const { repeatMode } = usePlayerStore.getState();
    const audio = audioRef.current;

    if (repeatMode === "one" && audio) {
      console.log("[PlayerProvider] Repeat one - restarting track");
      audio.currentTime = 0;
      audio.play().catch((e) => {
        isAutoAdvancing = false;
        usePlayerStore.getState().setStatus("paused");
        console.error("[PlayerProvider] Repeat play failed:", e);
      });
      return;
    }

    const nextTrack = next();
    if (nextTrack) {
      console.log("[PlayerProvider] Playing next track:", nextTrack.title);
      playTrackAfterEnded(nextTrack);
    } else if (repeatMode === "all") {
      console.log("[PlayerProvider] Repeat all - restarting queue");
      const queue = useQueueStore.getState();
      if (queue.tracks.length > 0) {
        useQueueStore.getState().skipTo(0);
        playTrackAfterEnded(queue.tracks[0]);
      }
    } else {
      console.log("[PlayerProvider] Queue ended");
      isAutoAdvancing = false;
      usePlayerStore.getState().setStatus("idle");
    }
  }, [next]);

  useEffect(() => {
    handleTrackEndRef.current = handleTrackEnd;
  }, [handleTrackEnd]);

  // Resolve the next cached song before the current one reaches `ended` and
  // keep its blob URL ready for the native handoff. Do this while online too:
  // using navigator.onLine to prefer /api/audio caused iOS to suspend the PWA
  // while that network stream was starting, even when the song was downloaded.
  useEffect(() => {
    const nextTrack = queueTracks[queueIndex + 1]
      ?? (repeatMode === "all" ? queueTracks[0] : undefined);
    if (!nextTrack) {
      releasePreparedNextSource();
      return;
    }
    if (preparedNextSource?.videoId === nextTrack.videoId) return;

    let cancelled = false;
    void resolveAudioSource(nextTrack).then((source) => {
      if (cancelled) {
        if (source.isFromCache) offlinePlaybackService.revokeBlobUrl(source.url);
        return;
      }
      releasePreparedNextSource();
      if (source.isFromCache) {
        preparedNextSource = { ...source, videoId: nextTrack.videoId };
      }
    });

    return () => {
      cancelled = true;
    };
  }, [queueIndex, queueTracks, repeatMode]);

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
      isAutoAdvancing = false;
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
    } else if (status === "idle" || status === "error") {
      navigator.mediaSession.playbackState = "none";
    }
    // Preserve the previous state while loading. Setting it to "none" during
    // an ended-event handoff tells iOS that the media session has terminated.
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

function isValidTrack(track: Track): boolean {
  return Boolean(track.videoId && /^[a-zA-Z0-9_-]{11}$/.test(track.videoId));
}

function releasePreparedNextSource() {
  if (
    preparedNextSource?.isFromCache
    && preparedNextSource.url !== currentBlobUrl
  ) {
    offlinePlaybackService.revokeBlobUrl(preparedNextSource.url);
  }
  preparedNextSource = null;
}

async function resolveAudioSource(track: Track): Promise<ResolvedAudioSource> {
  try {
    const source = await offlinePlaybackService.getAudioUrl(track.videoId);
    if (source.isFromCache) {
      console.log("[playTrack] Resolved cached source:", track.videoId);
      return source;
    }

    const savedUrl = await savedUrlStore.getValidUrl(track.videoId);
    if (savedUrl) {
      console.log("[playTrack] Resolved saved direct URL:", track.videoId);
      return { url: savedUrl, isFromCache: false };
    }
  } catch {
    console.log("[playTrack] Source lookup failed, using network proxy:", track.videoId);
  }

  return {
    url: `${AUDIO_BACKEND_URL}/audio/${track.videoId}`,
    isFromCache: false,
  };
}

/**
 * Assign and start a source without yielding the JavaScript task.
 *
 * This is the critical iOS invariant: when called from `ended`, src + load() +
 * play() all happen on the already-authorized audio element before WebKit gets
 * an opportunity to suspend the background PWA.
 */
function startTrackPlayback(
  track: Track,
  source: ResolvedAudioSource,
  skipRadio: boolean,
  requestId: number,
) {
  if (expireSleepTimerIfNeeded() || !audioElement || requestId !== trackRequestId) {
    if (source.isFromCache) offlinePlaybackService.revokeBlobUrl(source.url);
    return;
  }

  if (currentBlobUrl && currentBlobUrl !== source.url) {
    offlinePlaybackService.revokeBlobUrl(currentBlobUrl);
  }
  currentBlobUrl = source.isFromCache ? source.url : null;

  const { setCurrentTrack, setStatus, setDuration, setStreamInfo } =
    usePlayerStore.getState();
  setCurrentTrack(track);
  setStatus("loading");
  setDuration(track.duration || 0);

  const audio = audioElement;
  console.log("[playTrack] Setting src:", source.url.substring(0, 50) + "...");
  audio.src = source.url;
  audio.load();

  // A single play request owns this source. `canplay` only reports readiness;
  // it must not issue a second request after the ended-event task has returned.
  audio.play().catch((error) => {
    if (requestId !== trackRequestId) return;
    isAutoAdvancing = false;
    setStatus("paused");
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    console.error("[playTrack] Playback request rejected:", error?.name, error);
  });

  setStreamInfo({
    url: source.url,
    mimeType: "audio/mp4",
    bitrate: 128000,
    duration: track.duration || 0,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    videoId: track.videoId,
  });

  const isOffline = !navigator.onLine;
  if (!source.isFromCache && !isOffline) {
    void cacheAudioInBackground(track);
  }

  if (!skipRadio && !isOffline) {
    const queue = useQueueStore.getState();
    const upcomingCount = queue.tracks.length - queue.currentIndex - 1;
    if (upcomingCount <= 2) void fetchRadioQueue(track.videoId);
  }
}

function playTrackAfterEnded(track: Track) {
  if (!isValidTrack(track)) {
    console.warn("[playTrack] Invalid auto-advance track:", track.videoId);
    isAutoAdvancing = false;
    usePlayerStore.getState().setStatus("error");
    return;
  }

  let source: ResolvedAudioSource | null = null;
  if (preparedNextSource?.videoId === track.videoId) {
    source = preparedNextSource;
    preparedNextSource = null;
  } else if (navigator.onLine) {
    // This URL is deterministic; redirects and stream resolution happen in the
    // media loader, without yielding the ended-event JavaScript task.
    source = {
      url: `${AUDIO_BACKEND_URL}/audio/${track.videoId}`,
      isFromCache: false,
    };
  }

  if (!source) {
    console.error("[playTrack] Next offline source was not prepared:", track.videoId);
    isAutoAdvancing = false;
    usePlayerStore.getState().setStatus("error");
    return;
  }

  const requestId = ++trackRequestId;
  playRetryCount = 0;
  startTrackPlayback(track, source, true, requestId);
}

export async function playTrack(track: Track, skipRadio = false) {
  const player = usePlayerStore.getState();
  if (!skipRadio && player.currentTrack?.videoId === track.videoId && player.status !== "idle" && player.status !== "error" && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
    // Expanding the current song must not cancel an in-flight playback request.
    useUIStore.getState().setFullscreenPlayer(true);
    return;
  }
  const requestId = ++trackRequestId;
  const { currentTrack, setStatus } = usePlayerStore.getState();

  console.log("[playTrack] Starting:", track.videoId, track.title);
  isAutoAdvancing = false;

  if (!isValidTrack(track)) {
    console.warn("[playTrack] Invalid videoId, skipping:", track.videoId);
    const nextTrack = useQueueStore.getState().next();
    if (nextTrack) void playTrack(nextTrack, true);
    return;
  }

  if (currentTrack?.videoId === track.videoId && audioElement?.src) {
    if (audioElement.paused) {
      console.log("[playTrack] Resuming paused track");
      audioElement.play().catch((error) => {
        if (requestId !== trackRequestId) return;
        setStatus("paused");
        console.error("[playTrack] Resume failed:", error);
      });
    }
    return;
  }

  playRetryCount = 0;
  const source = await resolveAudioSource(track);

  if (requestId !== trackRequestId) {
    if (source.isFromCache) offlinePlaybackService.revokeBlobUrl(source.url);
    return;
  }

  if (!navigator.onLine && !source.isFromCache) {
    console.warn("[playTrack] Offline and not cached, cannot play:", track.videoId);
    setStatus("error");
    const nextTrack = useQueueStore.getState().next();
    if (nextTrack) void playTrack(nextTrack, true);
    return;
  }

  startTrackPlayback(track, source, skipRadio, requestId);
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
