"use client";

import { usePlayerStore } from "@/stores/playerStore";
import { useQueueStore } from "@/stores/queueStore";
import { useUIStore } from "@/stores/uiStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { playTrack, togglePlayback, seekTo, handleShuffle } from "./PlayerProvider";
import { formatTime } from "@/lib/utils";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Track } from "@/types";
import { MobileNowPlaying } from "./MobileNowPlaying";
import { SleepTimerMenu } from "./SleepTimerMenu";

const queueTabs = ["UP NEXT", "LYRICS", "RELATED"];

export function FullscreenPlayer() {
  const { isFullscreenPlayer, setFullscreenPlayer } = useUIStore();
  const {
    currentTrack,
    status,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffled,
    repeatMode,
    setVolume,
    toggleMute,
    cycleRepeatMode,
  } = usePlayerStore();
  const { tracks, currentIndex, next, previous, skipTo, removeFromQueue } = useQueueStore();
  const [activeTab, setActiveTab] = useState("UP NEXT");
  const [related, setRelated] = useState<{ videoId: string; tracks: Track[] }>({ videoId: "", tracks: [] });
  const [trackRating, setTrackRating] = useState<{ videoId: string; rating: "like" | "dislike" | "none" }>({ videoId: "", rating: "none" });
  const relatedTracks = related.videoId === currentTrack?.videoId ? related.tracks : [];
  const relatedLoading = isFullscreenPlayer && Boolean(currentTrack) && related.videoId !== currentTrack?.videoId;
  const rating = trackRating.videoId === currentTrack?.videoId ? trackRating.rating : "none";
  const { toggleSaveTrack, isTrackSaved } = useLibraryStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  const hasCurrentTrack = Boolean(currentTrack);

  useEffect(() => {
    if (!isFullscreenPlayer || !hasCurrentTrack) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof HTMLElement && event.target.closest("[data-sleep-timer-menu]"))) return;
      if (event.key === "Escape") {
        setFullscreenPlayer(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href], [tabindex='0']") || []).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [isFullscreenPlayer, hasCurrentTrack, setFullscreenPlayer]);

  // Swipe-down to close
  const touchStartY = useRef<number | null>(null);
  const touchDeltaY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    // Only allow downward drag
    if (delta > 0) {
      touchDeltaY.current = delta;
      setDragOffset(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // Close if dragged more than 120px down
    if (touchDeltaY.current > 120) {
      setDragOffset(0);
      setFullscreenPlayer(false);
    } else {
      // Snap back
      setDragOffset(0);
    }
    touchStartY.current = null;
    touchDeltaY.current = 0;
  }, [setFullscreenPlayer]);

  // Fetch rating when track changes
  useEffect(() => {
    if (!currentTrack?.videoId || !isFullscreenPlayer) return;
    const videoId = currentTrack.videoId;
    let cancelled = false;
    fetch(`/api/rate?videoId=${videoId}`)
      .then(r => r.ok ? r.json() : { rating: "none" })
      .then(d => { if (!cancelled) setTrackRating({ videoId, rating: d.rating || "none" }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentTrack?.videoId, isFullscreenPlayer]);

  const handleRate = async (newRating: "like" | "dislike") => {
    const finalRating = rating === newRating ? "none" : newRating;
    setTrackRating({ videoId: currentTrack!.videoId, rating: finalRating });
    fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: currentTrack!.videoId, rating: finalRating }),
    }).catch(() => {});
  };

  // Fetch related songs when current track changes
  useEffect(() => {
    if (!currentTrack?.videoId || !isFullscreenPlayer) return;
    
    let cancelled = false;
    const videoId = currentTrack.videoId;

    fetch(`/api/related?videoId=${currentTrack.videoId}`)
      .then((res) => res.ok ? res.json() : { tracks: [] })
      .then((data) => {
        if (!cancelled) {
          setRelated({ videoId, tracks: data.tracks || [] });
        }
      })
      .catch(() => {
        if (!cancelled) setRelated({ videoId, tracks: [] });
      });

    return () => { cancelled = true; };
  }, [currentTrack?.videoId, isFullscreenPlayer]);

  if (!isFullscreenPlayer || !currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isLoading = status === "loading";
  const upNextTracks = tracks.slice(currentIndex + 1);

  const handleNext = () => {
    const nextTrack = next();
    if (nextTrack) playTrack(nextTrack);
  };

  const handlePrev = () => {
    const prevTrack = previous();
    if (prevTrack) playTrack(prevTrack);
  };

  const handleQueueTrackClick = (track: Track, queueIndex: number) => {
    const actualIndex = currentIndex + 1 + queueIndex;
    skipTo(actualIndex);
    playTrack(track);
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Now playing: ${currentTrack.title}`}
      aria-modal="true"
      className="fixed inset-0 z-[100] h-dvh bg-background flex flex-col animate-in slide-in-from-bottom transition-transform duration-300 motion-reduce:animate-none motion-reduce:transition-none outline-none"
      style={{
        transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        transition: dragOffset === 0 ? undefined : "none",
      }}
    >
      {/* Top bar with tabs - add safe area padding for iOS notch */}
      <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className="flex items-center justify-between px-4 md:px-6 min-h-14 md:h-14 pt-[env(safe-area-inset-top)] border-b border-outline-variant/10 flex-shrink-0">
        <button
          onClick={() => setFullscreenPlayer(false)}
          aria-label="Close now playing"
          className="flex size-11 md:size-9 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[24px] md:text-[28px]">keyboard_arrow_down</span>
        </button>
        <span className="text-sm font-semibold text-on-surface md:hidden">Now playing</span>
        <div className="hidden md:flex gap-4 md:gap-6">
          {queueTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-[11px] md:text-[12px] font-semibold tracking-[0.05em] uppercase py-2 border-b-2 transition-colors ${
                activeTab === tab
                  ? "text-on-surface border-on-surface"
                  : "text-on-surface-variant border-transparent hover:text-on-surface"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="md:hidden"><SleepTimerMenu /></div>
        <div className="hidden w-8 md:block" />
      </div>

      {/* Main content — stacked on mobile, side-by-side on desktop */}
      <div className="min-h-0 flex-1 flex flex-col md:flex-row overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] md:overflow-hidden md:pb-0">
        {/* Queue section (shown on mobile in tab area, on desktop as right panel) */}
        <div className="flex-none flex flex-col md:flex-1 md:overflow-hidden md:flex-row">
          <MobileNowPlaying key={currentTrack.videoId} track={currentTrack} rating={rating} onRate={handleRate} onPrevious={handlePrev} onNext={handleNext} />
          {/* Desktop: Left — Album art (hidden on mobile) */}
          <div className="hidden md:flex flex-1 items-center justify-center p-8 min-w-0">
            <div className="relative w-full max-w-[500px] aspect-square rounded-lg overflow-hidden bg-surface-container-highest shadow-2xl">
              {currentTrack.thumbnail ? (
                <img
                  src={currentTrack.thumbnailLarge || currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant text-[80px]">music_note</span>
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Queue / content panel */}
          <div className="flex-none md:w-[400px] md:border-l border-outline-variant/10 flex flex-col md:overflow-hidden">
            <div aria-label="Player sections" className="flex border-b border-outline-variant/20 px-4 md:hidden">
              {queueTabs.map((tab) => (
                <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)} className={`min-h-12 flex-1 border-b-2 text-xs font-semibold tracking-wide focus-visible:outline-2 focus-visible:outline-primary ${activeTab === tab ? "border-on-surface text-on-surface" : "border-transparent text-on-surface-variant"}`}>
                  {tab}
                </button>
              ))}
            </div>
            {/* Playing from header */}
            <div className="px-4 py-3 border-b border-outline-variant/10 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-on-surface-variant">Playing from</p>
                  <p className="text-[14px] text-on-surface font-semibold">Your Queue</p>
                </div>
                <button className="hidden md:flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-[12px] font-semibold border border-outline-variant/30 px-3 py-1.5 rounded-full transition-colors">
                  <span className="material-symbols-outlined text-[16px]">playlist_add</span>
                  Save
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="md:flex-1 md:overflow-y-auto">
              {activeTab === "UP NEXT" && (
                <div className="py-2">
                  {/* Currently playing */}
                  <div className="flex items-center gap-3 px-4 py-2 bg-surface-container-high/50">
                    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 relative">
                      {currentTrack.thumbnail ? (
                        <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-surface-container flex items-center justify-center">
                          <span className="material-symbols-outlined text-[16px]">music_note</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {status === "playing" ? "equalizer" : "play_arrow"}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-primary font-semibold truncate">{currentTrack.title}</p>
                      <p className="text-[12px] text-on-surface-variant truncate">{currentTrack.artist}</p>
                    </div>
                    <span className="text-[12px] text-on-surface-variant">{formatTime(duration)}</span>
                  </div>

                  {/* Queue tracks */}
                  {upNextTracks.map((track, i) => (
                    <div
                      key={`${track.id}-${i}`}
                      onClick={() => handleQueueTrackClick(track, i)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-surface-container-high/30 cursor-pointer group transition-colors"
                    >
                      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 relative">
                        {track.thumbnail ? (
                          <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-surface-container flex items-center justify-center">
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">music_note</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-on-surface truncate group-hover:text-primary transition-colors">{track.title}</p>
                        <p className="text-[12px] text-on-surface-variant truncate">{track.artist}</p>
                      </div>
                      <span className="text-[12px] text-on-surface-variant">{track.duration > 0 ? formatTime(track.duration) : ""}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromQueue(currentIndex + 1 + i); }}
                        className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface p-1 transition-all"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                  ))}

                  {upNextTracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[32px] mb-2">queue_music</span>
                      <p className="text-[14px]">No songs in queue</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "LYRICS" && (
                <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] mb-2">lyrics</span>
                  <p className="text-[14px]">Lyrics not available</p>
                </div>
              )}

              {activeTab === "RELATED" && (
                <div className="py-2">
                  {relatedLoading && (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!relatedLoading && relatedTracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[32px] mb-2">explore</span>
                      <p className="text-[14px]">No related songs found</p>
                    </div>
                  )}
                  {!relatedLoading && relatedTracks.map((track, i) => (
                    <div
                      key={`related-${track.videoId}-${i}`}
                      onClick={() => {
                        useQueueStore.getState().addToQueue(track);
                        playTrack(track);
                      }}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-surface-container-high/30 cursor-pointer group transition-colors"
                    >
                      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 relative">
                        {track.thumbnail ? (
                          <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-surface-container flex items-center justify-center">
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">music_note</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-on-surface truncate group-hover:text-primary transition-colors">{track.title}</p>
                        <p className="text-[12px] text-on-surface-variant truncate">{track.artist}</p>
                      </div>
                      <span className="text-[12px] text-on-surface-variant">{track.duration > 0 ? formatTime(track.duration) : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom player controls */}
      <div className="hidden md:block border-t border-outline-variant/10 bg-surface-container/80 backdrop-blur-xl flex-shrink-0 pb-safe">
        {/* Progress bar */}
        <div
          className="h-3 w-full bg-surface-container-highest cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            seekTo(percent * duration);
          }}
        >
          <div className="h-full bg-primary relative" style={{ width: `${progress}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100" />
          </div>
        </div>

        {/* Mobile controls */}
        <div className="flex md:hidden items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
              {currentTrack.thumbnail && <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-on-surface font-semibold truncate">{currentTrack.title}</p>
              <p className="text-[11px] text-on-surface-variant truncate">{currentTrack.artist}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const newVol = Math.max(0, volume - 0.1);
                setVolume(newVol);
              }}
              className="text-on-surface-variant p-1"
            >
              <span className="material-symbols-outlined text-[20px]">volume_down</span>
            </button>
            <button onClick={handlePrev} className="text-on-surface p-1">
              <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>skip_previous</span>
            </button>
            <button onClick={togglePlayback} className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center">
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {status === "playing" ? "pause" : "play_arrow"}
                </span>
              )}
            </button>
            <button onClick={handleNext} className="text-on-surface p-1">
              <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>skip_next</span>
            </button>
            <button
              onClick={() => {
                const newVol = Math.min(1, volume + 0.1);
                setVolume(newVol);
              }}
              className="text-on-surface-variant p-1"
            >
              <span className="material-symbols-outlined text-[20px]">volume_up</span>
            </button>
          </div>
        </div>

        {/* Desktop controls */}
        <div className="hidden md:flex items-center justify-between px-6 h-20">
          <div className="flex items-center gap-4 w-1/3 min-w-0">
            <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
              {currentTrack.thumbnail && <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] text-on-surface font-semibold truncate">{currentTrack.title}</p>
              <p className="text-[12px] text-on-surface-variant truncate">{currentTrack.artist}</p>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => handleRate("like")}
                className={`p-1 transition-colors ${rating === "like" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                <span className="material-symbols-outlined text-[20px]" style={rating === "like" ? { fontVariationSettings: "'FILL' 1" } : undefined}>thumb_up</span>
              </button>
              <button
                onClick={() => handleRate("dislike")}
                className={`p-1 transition-colors ${rating === "dislike" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                <span className="material-symbols-outlined text-[20px]" style={rating === "dislike" ? { fontVariationSettings: "'FILL' 1" } : undefined}>thumb_down</span>
              </button>
              <button
                onClick={() => toggleSaveTrack(currentTrack)}
                className={`p-1 transition-colors ${isTrackSaved(currentTrack.videoId) ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                <span className="material-symbols-outlined text-[20px]" style={isTrackSaved(currentTrack.videoId) ? { fontVariationSettings: "'FILL' 1" } : undefined}>bookmark</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-5 w-1/3 justify-center">
            <button onClick={handleShuffle} className={`text-on-surface-variant hover:text-on-surface ${isShuffled ? "!text-primary" : ""}`}>
              <span className="material-symbols-outlined text-[20px]">shuffle</span>
            </button>
            <button onClick={handlePrev} className="text-on-surface hover:text-primary">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>skip_previous</span>
            </button>
            <button onClick={togglePlayback} className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 transition-transform">
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {status === "playing" ? "pause" : "play_arrow"}
                </span>
              )}
            </button>
            <button onClick={handleNext} className="text-on-surface hover:text-primary">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>skip_next</span>
            </button>
            <button onClick={cycleRepeatMode} className={`text-on-surface-variant hover:text-on-surface ${repeatMode !== "none" ? "!text-primary" : ""}`}>
              <span className="material-symbols-outlined text-[20px]">{repeatMode === "one" ? "repeat_one" : "repeat"}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 w-1/3 justify-end">
            <span className="text-[12px] text-on-surface-variant tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <button onClick={toggleMute} className="text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined text-[20px]">{isMuted ? "volume_off" : "volume_up"}</span>
            </button>
            <input
              type="range" min="0" max="1" step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1 bg-surface-container-highest rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-on-surface-variant"
            />
            <button onClick={() => setFullscreenPlayer(false)} className="text-on-surface-variant hover:text-on-surface ml-2">
              <span className="material-symbols-outlined text-[20px]">fullscreen_exit</span>
            </button>
          </div>
        </div>

        {/* Mobile time display */}
        <div className="flex md:hidden justify-between px-4 pb-2 text-[11px] text-on-surface-variant tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
