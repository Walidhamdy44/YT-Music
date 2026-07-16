"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { TrackRow } from "@/components/track/TrackRow";
import { useQueueStore } from "@/stores/queueStore";
import { playTrack } from "@/components/player/PlayerProvider";
import type { Track } from "@/types";

interface PlaylistData {
  title: string;
  description: string;
  thumbnail: string;
  trackCount: number;
  tracks: Track[];
  nextPageToken?: string;
}

export default function YTPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const { setQueue } = useQueueStore();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        const res = await fetch(`/api/library/playlist/${id}`);
        if (res.ok) {
          const data = await res.json();
          setPlaylist(data);
          setTracks(data.tracks || []);
          setNextPageToken(data.nextPageToken);
        }
      } catch (err) {
        console.error("Failed to fetch playlist:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylist();
  }, [id]);

  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/library/playlist/${id}?pageToken=${nextPageToken}`);
      if (res.ok) {
        const data = await res.json();
        setTracks((prev) => [...prev, ...(data.tracks || [])]);
        setNextPageToken(data.nextPageToken);
      }
    } catch (err) {
      console.error("Failed to load more tracks:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [id, nextPageToken, loadingMore]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextPageToken && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [nextPageToken, loadingMore, loadMore]);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setQueue(tracks, 0);
      playTrack(tracks[0]);
    }
  };

  const handleShuffle = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
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
            <div className="w-48 h-48 rounded-xl bg-surface-container animate-pulse" />
            <div className="space-y-3">
              <div className="h-8 bg-surface-container rounded w-48 animate-pulse" />
              <div className="h-4 bg-surface-container rounded w-32 animate-pulse" />
            </div>
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
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

  if (!playlist) {
    return (
      <>
        <Header />
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-[48px] mb-4">error</span>
          <p className="text-[16px]">Playlist not found</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Playlist Header */}
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">
          <div className="w-48 h-48 md:w-56 md:h-56 rounded-xl overflow-hidden bg-surface-container-highest shadow-xl flex-shrink-0">
            {playlist.thumbnail ? (
              <img alt={playlist.title} className="w-full h-full object-cover" src={playlist.thumbnail} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant text-[64px]">queue_music</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4 text-center md:text-left">
            <p className="text-[12px] leading-[16px] font-semibold tracking-[0.05em] text-on-surface-variant uppercase">
              YouTube Playlist
            </p>
            <h1 className="text-[32px] md:text-[48px] leading-[40px] md:leading-[56px] font-extrabold tracking-tight text-on-surface">
              {playlist.title}
            </h1>
            {playlist.description && (
              <p className="text-[14px] leading-[20px] text-on-surface-variant line-clamp-2">
                {playlist.description}
              </p>
            )}
            <p className="text-[14px] leading-[20px] text-on-surface-variant">
              {playlist.trackCount || tracks.length} songs
            </p>
            <div className="flex gap-4 justify-center md:justify-start">
              <button
                onClick={handlePlayAll}
                className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-primary/20"
              >
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
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
          {tracks.map((track, i) => (
            <TrackRow
              key={`${track.id}-${i}`}
              track={track}
              tracks={tracks}
              index={i}
            />
          ))}

          {/* Infinite scroll trigger */}
          {nextPageToken && (
            <div ref={loadMoreRef} className="flex items-center justify-center py-4">
              {loadingMore ? (
                <div className="flex items-center gap-3 text-on-surface-variant">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[14px]">Loading more...</span>
                </div>
              ) : (
                <div className="h-8" />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
