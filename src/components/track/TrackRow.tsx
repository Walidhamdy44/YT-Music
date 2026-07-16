"use client";

import type { Track } from "@/types";
import { playTrack } from "@/components/player/PlayerProvider";
import { useQueueStore } from "@/stores/queueStore";
import { usePlayerStore } from "@/stores/playerStore";
import { formatTime } from "@/lib/utils";

interface TrackRowProps {
  track: Track;
  tracks?: Track[];
  index?: number;
  showDuration?: boolean;
}

export function TrackRow({ track, tracks, index = 0, showDuration = true }: TrackRowProps) {
  const { setQueue } = useQueueStore();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const status = usePlayerStore((s) => s.status);

  const isCurrentTrack = currentTrack?.videoId === track.videoId;
  const isPlaying = isCurrentTrack && status === "playing";
  const isLoading = isCurrentTrack && status === "loading";

  const handlePlay = () => {
    if (tracks) {
      setQueue(tracks, index);
    }
    playTrack(track);
  };

  // Generate a consistent color from the track title for placeholder
  const getPlaceholderColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 30%, 20%)`;
  };

  return (
    <div
      onClick={handlePlay}
      className={`group flex items-center gap-3 p-2 rounded-md hover:bg-surface-container-high transition-colors cursor-pointer ${
        isCurrentTrack ? "bg-surface-container" : ""
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
        {track.thumbnail && !track.thumbnail.includes("/api/placeholder") ? (
          <img
            alt={track.title}
            className="w-full h-full object-cover"
            src={track.thumbnail}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: getPlaceholderColor(track.title) }}
          >
            <span className="material-symbols-outlined text-primary/60 text-[20px]">
              music_note
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <span className="material-symbols-outlined text-white text-[20px]">equalizer</span>
          ) : (
            <span
              className="material-symbols-outlined text-white"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              play_arrow
            </span>
          )}
        </div>
        {/* Always show indicator for current playing track */}
        {isCurrentTrack && !isLoading && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            {isPlaying ? (
              <span className="material-symbols-outlined text-primary text-[20px]">equalizer</span>
            ) : (
              <span className="material-symbols-outlined text-primary text-[20px]">pause</span>
            )}
          </div>
        )}
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] leading-[20px] font-semibold truncate group-hover:text-primary transition-colors ${
          isCurrentTrack ? "text-primary" : "text-on-surface"
        }`}>
          {track.title}
        </p>
        <p className="text-[12px] leading-[16px] font-semibold tracking-[0.05em] text-on-surface-variant truncate normal-case">
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      {showDuration && track.duration > 0 && (
        <span className="text-[14px] leading-[20px] text-on-surface-variant hidden md:block">
          {formatTime(track.duration)}
        </span>
      )}

      {/* More button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
        }}
        className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface transition-all p-1"
      >
        <span className="material-symbols-outlined">more_vert</span>
      </button>
    </div>
  );
}
