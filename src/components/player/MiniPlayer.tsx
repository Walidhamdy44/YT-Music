"use client";

import { usePlayerStore } from "@/stores/playerStore";
import { useQueueStore } from "@/stores/queueStore";
import { playTrack, togglePlayback, seekTo, handleShuffle } from "./PlayerProvider";
import { useUIStore } from "@/stores/uiStore";
import { formatTime } from "@/lib/utils";

export function MiniPlayer() {
  const { currentTrack, status, currentTime, duration, volume, isMuted, isShuffled, repeatMode } =
    usePlayerStore();
  const { next, previous } = useQueueStore();
  const { setFullscreenPlayer } = useUIStore();
  const { setVolume, toggleMute, toggleShuffle: _, cycleRepeatMode } = usePlayerStore();

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isLoading = status === "loading";

  const handleNext = () => {
    const nextTrack = next();
    if (nextTrack) playTrack(nextTrack);
  };

  const handlePrev = () => {
    const prevTrack = previous();
    if (prevTrack) playTrack(prevTrack);
  };

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 w-full z-50 md:pl-[240px] bg-surface-container-high/90 backdrop-blur-xl border-t border-white/5 transition-all">
      {/* Progress bar */}
      <div
        className="h-1 w-full bg-surface-container-highest cursor-pointer group progress-bar-container relative"
        onClick={(e) => {
          if (isLoading) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          const newTime = percent * duration;
          seekTo(newTime);
        }}
      >
        {isLoading ? (
          /* Loading animation — indeterminate progress bar */
          <div className="h-full w-full overflow-hidden">
            <div className="h-full bg-primary/70 animate-[loading_1.5s_ease-in-out_infinite] w-1/3" />
          </div>
        ) : (
          <div
            className="h-full bg-primary progress-bar-fill transition-[width] duration-100 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 shadow-[0_0_8px_rgba(255,179,172,0.8)]" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 md:px-6 h-20">
        {/* Now Playing Info */}
        <div className="flex items-center gap-4 w-1/3 min-w-0">
          <div
            className="w-14 h-14 rounded overflow-hidden bg-surface-container flex-shrink-0 shadow-md cursor-pointer relative"
            onClick={() => setFullscreenPlayer(true)}
          >
            {currentTrack.thumbnail ? (
              <img
                alt="Now playing"
                className={`w-full h-full object-cover ${isLoading ? "opacity-60" : ""}`}
                src={currentTrack.thumbnail}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant">
                  music_note
                </span>
              </div>
            )}
            {/* Loading spinner overlay on thumbnail */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-[16px] leading-[24px] text-on-surface font-semibold truncate">
              {currentTrack.title}
            </p>
            <p className="text-[14px] leading-[20px] text-on-surface-variant truncate">
              {isLoading ? "Loading..." : currentTrack.artist}
            </p>
          </div>
          <button className="text-on-surface-variant hover:text-primary ml-2 hidden sm:block">
            <span className="material-symbols-outlined">favorite</span>
          </button>
        </div>

        {/* Player Controls */}
        <div className="flex items-center justify-center gap-4 md:gap-6 w-1/3">
          <button
            onClick={handleShuffle}
            className={`text-on-surface-variant hover:text-on-surface transition-colors hidden md:block ${isShuffled ? "!text-primary" : ""}`}
          >
            <span className="material-symbols-outlined">shuffle</span>
          </button>
          <button onClick={handlePrev} className="text-on-surface hover:text-primary transition-colors">
            <span
              className="material-symbols-outlined text-[32px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              skip_previous
            </span>
          </button>

          {/* Play/Pause button with loading state */}
          <button
            onClick={togglePlayback}
            disabled={isLoading}
            className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 transition-transform shadow-[0_0_16px_-4px_rgba(255,179,172,0.4)] disabled:opacity-70 disabled:hover:scale-100"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <span
                className="material-symbols-outlined text-[32px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {status === "playing" ? "pause" : "play_arrow"}
              </span>
            )}
          </button>

          <button onClick={handleNext} className="text-on-surface hover:text-primary transition-colors">
            <span
              className="material-symbols-outlined text-[32px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              skip_next
            </span>
          </button>
          <button
            onClick={cycleRepeatMode}
            className={`text-on-surface-variant hover:text-on-surface transition-colors hidden md:block ${repeatMode !== "none" ? "!text-primary" : ""}`}
          >
            <span className="material-symbols-outlined">
              {repeatMode === "one" ? "repeat_one" : "repeat"}
            </span>
          </button>
        </div>

        {/* Volume & Time */}
        <div className="flex items-center justify-end gap-4 w-1/3 hidden md:flex">
          <span className="text-[14px] leading-[20px] text-on-surface-variant tabular-nums">
            {isLoading ? "--:-- / --:--" : `${formatTime(currentTime)} / ${formatTime(duration)}`}
          </span>
          <button
            onClick={toggleMute}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">
              {isMuted || volume === 0 ? "volume_off" : "volume_up"}
            </span>
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-24 h-1 bg-surface-container-highest rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-on-surface-variant hover:[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:transition-colors"
          />
        </div>
      </div>
    </div>
  );
}
