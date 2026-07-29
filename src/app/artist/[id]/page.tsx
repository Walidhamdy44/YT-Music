"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TrackRow } from "@/components/track/TrackRow";
import { AlbumCard } from "@/components/track/AlbumCard";
import { useQueueStore } from "@/stores/queueStore";
import { playTrack, handleShuffle } from "@/components/player/PlayerProvider";
import type { Track, Album } from "@/types";

interface ArtistData {
  id: string;
  name: string;
  thumbnail: string;
  thumbnailLarge: string;
  subscribers: string;
  description: string;
  tracks: Track[];
  albums: Album[];
  singles: Album[];
}

export default function ArtistPage() {
  const params = useParams();
  const id = params.id as string;
  const { setQueue } = useQueueStore();
  const [artist, setArtist] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchArtist = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/artist/${id}`);
        if (!res.ok) throw new Error("Failed to fetch artist");
        const data = await res.json();
        setArtist(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artist");
      } finally {
        setLoading(false);
      }
    };

    fetchArtist();
  }, [id]);

  const handlePlayAll = () => {
    if (artist && artist.tracks.length > 0) {
      setQueue(artist.tracks, 0);
      playTrack(artist.tracks[0]);
    }
  };

  const handleShufflePlay = () => {
    if (artist && artist.tracks.length > 0) {
      const shuffled = [...artist.tracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled, 0);
      playTrack(shuffled[0]);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        {/* Skeleton header */}
        <div className="relative h-80 bg-gradient-to-b from-surface-container to-background">
          <div className="absolute inset-0 flex items-end p-8">
            <div className="flex items-end gap-6">
              <div className="w-48 h-48 rounded-full bg-surface-container animate-pulse" />
              <div className="flex flex-col gap-3 pb-4">
                <div className="h-4 w-20 bg-surface-container rounded animate-pulse" />
                <div className="h-12 w-64 bg-surface-container rounded animate-pulse" />
                <div className="h-4 w-32 bg-surface-container rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant">
        <span className="material-symbols-outlined text-[48px] mb-4">error</span>
        <p>{error || "Artist not found"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full pb-32">
      {/* Hero Header */}
      <div className="relative h-80 md:h-96 overflow-hidden">
        {/* Background blur */}
        {artist.thumbnailLarge && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110 blur-3xl opacity-30"
            style={{ backgroundImage: `url(${artist.thumbnailLarge})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
        
        {/* Content */}
        <div className="relative h-full flex items-end p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-6 w-full">
            {/* Artist Image */}
            <div className="w-40 h-40 md:w-48 md:h-48 rounded-full overflow-hidden shadow-2xl ring-2 ring-white/10 flex-shrink-0">
              {artist.thumbnail ? (
                <img
                  src={artist.thumbnailLarge || artist.thumbnail}
                  alt={artist.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
                  <span className="material-symbols-outlined text-[64px] text-on-surface-variant">person</span>
                </div>
              )}
            </div>
            
            {/* Artist Info */}
            <div className="flex flex-col items-center md:items-start gap-2 text-center md:text-left pb-4">
              <span className="text-[12px] uppercase tracking-wider text-on-surface-variant">Artist</span>
              <h1 className="text-[36px] md:text-[56px] font-bold text-on-surface leading-tight">
                {artist.name}
              </h1>
              {artist.subscribers && (
                <p className="text-[14px] text-on-surface-variant">
                  {artist.subscribers} monthly listeners
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 px-6 md:px-8 py-6">
        <button
          onClick={handlePlayAll}
          className="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-primary/30"
        >
          <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            play_arrow
          </span>
        </button>
        <button
          onClick={handleShufflePlay}
          className="w-12 h-12 rounded-full border border-outline-variant text-on-surface flex items-center justify-center hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-[24px]">shuffle</span>
        </button>
      </div>

      <div className="px-6 md:px-8 space-y-10">
        {/* Top Songs */}
        {artist.tracks.length > 0 && (
          <section>
            <h2 className="text-[24px] font-bold text-on-surface mb-4">Popular</h2>
            <div className="flex flex-col gap-1">
              {artist.tracks.slice(0, 10).map((track, i) => (
                <TrackRow
                  key={track.id || i}
                  track={track}
                  tracks={artist.tracks}
                  index={i}
                  showIndex
                />
              ))}
            </div>
          </section>
        )}

        {/* Albums */}
        {artist.albums.length > 0 && (
          <section>
            <h2 className="text-[24px] font-bold text-on-surface mb-4">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {artist.albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          </section>
        )}

        {/* Singles */}
        {artist.singles.length > 0 && (
          <section>
            <h2 className="text-[24px] font-bold text-on-surface mb-4">Singles & EPs</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {artist.singles.map((single) => (
                <AlbumCard key={single.id} album={single} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
