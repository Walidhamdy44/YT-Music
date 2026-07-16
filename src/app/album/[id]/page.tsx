"use client";

import { use, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { TrackRow } from "@/components/track/TrackRow";
import { useQueueStore } from "@/stores/queueStore";
import { playTrack } from "@/components/player/PlayerProvider";
import type { Track } from "@/types";

interface AlbumData {
  id: string;
  title: string;
  artist: string;
  year?: number;
  description: string;
  thumbnail: string;
  trackCount: number;
  tracks: Track[];
}

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const { setQueue } = useQueueStore();

  useEffect(() => {
    const fetchAlbum = async () => {
      try {
        const res = await fetch(`/api/album/${id}`);
        if (res.ok) {
          const data = await res.json();
          setAlbum(data);
        }
      } catch (err) {
        console.error("Failed to fetch album:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAlbum();
  }, [id]);

  const handlePlayAll = () => {
    if (album && album.tracks.length > 0) {
      setQueue(album.tracks, 0);
      playTrack(album.tracks[0]);
    }
  };

  const handleShuffle = () => {
    if (album && album.tracks.length > 0) {
      const shuffled = [...album.tracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled, 0);
      playTrack(shuffled[0]);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8">
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-end mb-8">
            <div className="w-48 h-48 md:w-56 md:h-56 rounded-xl bg-surface-container animate-pulse" />
            <div className="space-y-3 flex-1">
              <div className="h-4 bg-surface-container rounded w-20 animate-pulse" />
              <div className="h-10 bg-surface-container rounded w-64 animate-pulse" />
              <div className="h-4 bg-surface-container rounded w-40 animate-pulse" />
              <div className="h-4 bg-surface-container rounded w-24 animate-pulse" />
            </div>
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-12 h-12 rounded bg-surface-container animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-container rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-surface-container rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (!album) {
    return (
      <>
        <Header />
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-[48px] mb-4">error</span>
          <p className="text-[16px]">Album not found</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Album Header */}
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">
          <div className="w-48 h-48 md:w-56 md:h-56 rounded-xl overflow-hidden bg-surface-container-highest shadow-xl flex-shrink-0">
            {album.thumbnail ? (
              <img
                alt={album.title}
                className="w-full h-full object-cover"
                src={album.thumbnail}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant text-[64px]">
                  album
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 text-center md:text-left">
            <p className="text-[12px] leading-[16px] font-semibold tracking-[0.05em] text-on-surface-variant uppercase">
              Album
            </p>
            <h1 className="text-[32px] md:text-[48px] leading-[40px] md:leading-[56px] font-extrabold tracking-tight text-on-surface">
              {album.title}
            </h1>
            <div className="flex items-center gap-2 justify-center md:justify-start text-[14px] leading-[20px] text-on-surface-variant">
              <span className="font-semibold text-on-surface">{album.artist}</span>
              {album.year && (
                <>
                  <span>•</span>
                  <span>{album.year}</span>
                </>
              )}
              <span>•</span>
              <span>{album.tracks.length} songs</span>
            </div>
            {album.description && (
              <p className="text-[14px] leading-[20px] text-on-surface-variant line-clamp-2 max-w-lg">
                {album.description}
              </p>
            )}
            <div className="flex gap-4 justify-center md:justify-start mt-2">
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
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="flex flex-col gap-1">
          {album.tracks.map((track, i) => (
            <TrackRow
              key={track.id || i}
              track={track}
              tracks={album.tracks}
              index={i}
            />
          ))}
        </div>
      </div>
    </>
  );
}
