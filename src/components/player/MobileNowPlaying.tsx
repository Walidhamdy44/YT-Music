"use client";

import { useState } from "react";
import { Bookmark, Loader2, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, ThumbsUp } from "lucide-react";
import { useLibraryStore } from "@/stores/libraryStore";
import { usePlayerStore } from "@/stores/playerStore";
import { formatTime } from "@/lib/utils";
import type { Track } from "@/types";
import { handleShuffle, seekTo, togglePlayback } from "./PlayerProvider";

interface MobileNowPlayingProps {
  track: Track;
  rating: "like" | "dislike" | "none";
  onRate: (rating: "like" | "dislike") => void;
  onPrevious: () => void;
  onNext: () => void;
}

const controlClass = "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors active:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

function largeArtwork(track: Track): string {
  const source = track.thumbnailLarge || track.thumbnail;
  // Music search returns 120px covers. Request a display-sized version of the
  // same Google-hosted artwork instead of stretching the tiny list thumbnail.
  if (/^https:\/\/(?:yt3|lh3)\.googleusercontent\.com\//.test(source)) {
    return source.replace(/=w(\d+)-h(\d+)/, (_, width, height) => `=w${Math.max(720, Number(width))}-h${Math.max(720, Number(height))}`);
  }
  return source;
}

export function MobileNowPlaying({ track, rating, onRate, onPrevious, onNext }: MobileNowPlayingProps) {
  const { status, currentTime, duration, isShuffled, repeatMode, cycleRepeatMode } = usePlayerStore();
  const { toggleSaveTrack, isTrackSaved } = useLibraryStore();
  const [artwork, setArtwork] = useState(() => largeArtwork(track));
  const isLoading = status === "loading";
  const saved = isTrackSaved(track.videoId);
  const progress = duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0;

  return (
    <section aria-label="Current song" className="flex flex-col items-center px-6 pb-7 pt-5 md:hidden">
      <div className="aspect-square w-full max-w-[min(340px,48svh)] overflow-hidden rounded-lg bg-surface-container-highest">
        {artwork ? (
          <img
            src={artwork}
            alt={`${track.title} artwork`}
            width={640}
            height={640}
            draggable={false}
            className="size-full object-cover"
            onError={() => setArtwork(artwork !== track.thumbnail ? track.thumbnail : "")}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-on-surface-variant">
            <Music2 size={64} strokeWidth={1} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-6 w-full max-w-[340px]">
        <h1 id="mobile-now-playing-title" dir="auto" className="line-clamp-2 text-[22px] font-bold leading-[1.25] tracking-[-0.02em] text-on-surface">
          {track.title}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <p dir="auto" className="min-w-0 flex-1 truncate text-base leading-6 text-on-surface-variant">{track.artist}</p>
          <button type="button" aria-label="Like song" aria-pressed={rating === "like"} onClick={() => onRate("like")} className={`${controlClass} ${rating === "like" ? "text-primary" : "text-on-surface"}`}>
            <ThumbsUp size={20} fill={rating === "like" ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          <button type="button" aria-label={saved ? "Remove song from library" : "Save song to library"} aria-pressed={saved} onClick={() => toggleSaveTrack(track)} className={`${controlClass} ${saved ? "text-primary" : "text-on-surface"}`}>
            <Bookmark size={20} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3">
          <input
            type="range"
            aria-label="Seek through song"
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={Math.min(Math.max(currentTime, 0), Math.max(duration, 1))}
            disabled={isLoading || duration <= 0}
            onChange={(event) => seekTo(Number(event.target.value))}
            className="block h-6 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-on-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:-mt-[4px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-on-surface [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-container-highest [&::-moz-range-progress]:h-1 [&::-moz-range-progress]:bg-on-surface [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-on-surface"
            style={{ backgroundImage: `linear-gradient(to right, var(--on-surface) ${progress}%, var(--surface-container-highest) ${progress}%)`, backgroundSize: "100% 4px", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
          />
          <div className="flex justify-between text-xs tabular-nums text-on-surface-variant">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-1 text-on-surface">
          <button type="button" aria-label="Shuffle" aria-pressed={isShuffled} onClick={handleShuffle} className={`${controlClass} ${isShuffled ? "text-primary" : ""}`}>
            <Shuffle size={21} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Previous song" onClick={onPrevious} className={controlClass}>
            <SkipBack size={27} fill="currentColor" aria-hidden="true" />
          </button>
          <button type="button" aria-label={isLoading ? "Loading song" : status === "playing" ? "Pause" : "Play"} disabled={isLoading} onClick={togglePlayback} className="flex size-16 shrink-0 items-center justify-center rounded-full bg-on-surface text-surface transition-transform active:scale-95 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none">
            {isLoading ? <Loader2 size={28} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : status === "playing" ? <Pause size={28} fill="currentColor" aria-hidden="true" /> : <Play size={28} fill="currentColor" className="ml-1" aria-hidden="true" />}
          </button>
          <button type="button" aria-label="Next song" onClick={onNext} className={controlClass}>
            <SkipForward size={27} fill="currentColor" aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Repeat: ${repeatMode === "none" ? "off" : repeatMode === "one" ? "one song" : "all songs"}`} aria-pressed={repeatMode !== "none"} onClick={cycleRepeatMode} className={`${controlClass} ${repeatMode !== "none" ? "text-primary" : ""}`}>
            {repeatMode === "one" ? <Repeat1 size={21} aria-hidden="true" /> : <Repeat size={21} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  );
}
