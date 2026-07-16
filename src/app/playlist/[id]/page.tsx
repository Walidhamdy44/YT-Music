"use client";

import { use } from "react";
import { Header } from "@/components/layout/Header";
import { TrackRow } from "@/components/track/TrackRow";
import { useLibraryStore } from "@/stores/libraryStore";
import { useQueueStore } from "@/stores/queueStore";
import { playTrack } from "@/components/player/PlayerProvider";
import Link from "next/link";

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { playlists, deletePlaylist } = useLibraryStore();
  const { setQueue } = useQueueStore();
  const playlist = playlists.find((p) => p.id === id);

  if (!playlist) {
    return (
      <>
        <Header />
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-[48px] mb-4">error</span>
          <p className="text-[16px]">Playlist not found</p>
          <Link href="/library" className="mt-4 text-primary hover:underline">
            Back to Library
          </Link>
        </div>
      </>
    );
  }

  const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      setQueue(playlist.tracks, 0);
      playTrack(playlist.tracks[0]);
    }
  };

  const handleShuffle = () => {
    if (playlist.tracks.length > 0) {
      const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled, 0);
      playTrack(shuffled[0]);
    }
  };

  return (
    <>
      <Header />
      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Playlist Header */}
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">
          <div className="w-48 h-48 md:w-56 md:h-56 rounded-xl overflow-hidden bg-surface-container-highest shadow-xl flex-shrink-0">
            {playlist.thumbnail ? (
              <img
                alt={playlist.title}
                className="w-full h-full object-cover"
                src={playlist.thumbnail}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant text-[64px]">
                  queue_music
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4 text-center md:text-left">
            <p className="text-[12px] leading-[16px] font-semibold tracking-[0.05em] text-on-surface-variant uppercase">
              Playlist
            </p>
            <h1 className="text-[32px] md:text-[48px] leading-[40px] md:leading-[56px] font-extrabold tracking-tight text-on-surface">
              {playlist.title}
            </h1>
            {playlist.description && (
              <p className="text-[14px] leading-[20px] text-on-surface-variant">
                {playlist.description}
              </p>
            )}
            <p className="text-[14px] leading-[20px] text-on-surface-variant">
              {playlist.trackCount} songs
            </p>
            <div className="flex gap-4 justify-center md:justify-start">
              <button
                onClick={handlePlayAll}
                className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-primary/20"
              >
                <span
                  className="material-symbols-outlined text-[28px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  play_arrow
                </span>
              </button>
              <button
                onClick={handleShuffle}
                className="w-12 h-12 rounded-full border border-outline-variant text-on-surface flex items-center justify-center hover:bg-surface-container-highest transition-colors"
              >
                <span className="material-symbols-outlined">shuffle</span>
              </button>
              <button
                onClick={() => {
                  deletePlaylist(id);
                  window.location.href = "/library";
                }}
                className="w-12 h-12 rounded-full border border-outline-variant text-on-surface-variant flex items-center justify-center hover:bg-surface-container-highest hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="flex flex-col gap-1">
          {playlist.tracks.length > 0 ? (
            playlist.tracks.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                tracks={playlist.tracks}
                index={i}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] mb-4">playlist_add</span>
              <p className="text-[16px]">This playlist is empty</p>
              <p className="text-[14px] mt-1">Search for songs to add</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
