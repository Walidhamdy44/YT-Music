"use client";

import { Header } from "@/components/layout/Header";
import { useLibraryStore } from "@/stores/libraryStore";
import { TrackRow } from "@/components/track/TrackRow";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Track } from "@/types";

const tabs = ["Playlists", "Liked Songs", "Local Playlists"];

interface YTPlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  trackCount: number;
}

export default function LibraryPage() {
  const { data: session } = useSession();
  const { playlists: localPlaylists, likedTracks, createPlaylist } = useLibraryStore();
  const [activeTab, setActiveTab] = useState("Playlists");
  const [ytPlaylists, setYtPlaylists] = useState<YTPlaylist[]>([]);
  const [ytLikedSongs, setYtLikedSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likedNextPageToken, setLikedNextPageToken] = useState<string | undefined>();
  const [setupInstructions, setSetupInstructions] = useState<string[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Fetch YouTube library when signed in
  useEffect(() => {
    if (session) {
      fetchLibrary();
    }
  }, [session]);

  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/library");
      if (res.ok) {
        const data = await res.json();
        setYtPlaylists(data.playlists || []);
        setYtLikedSongs(data.likedSongs || []);
        setLikedNextPageToken(data.nextPageToken);
      } else if (res.status === 401) {
        setSetupInstructions(["Sign out and sign back in to grant YouTube access to your library."]);
      }
    } catch (err) {
      console.error("Failed to fetch library:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreLiked = useCallback(async () => {
    if (!likedNextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/library?pageToken=${likedNextPageToken}`);
      if (res.ok) {
        const data = await res.json();
        setYtLikedSongs((prev) => [...prev, ...(data.likedSongs || [])]);
        setLikedNextPageToken(data.nextPageToken);
      }
    } catch (err) {
      console.error("Failed to load more liked songs:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [likedNextPageToken, loadingMore]);

  // Intersection Observer for infinite scroll on liked songs
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    if (activeTab !== "Liked Songs") return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && likedNextPageToken && !loadingMore) {
          loadMoreLiked();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [activeTab, likedNextPageToken, loadingMore, loadMoreLiked]);

  return (
    <>
      <Header />
      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 space-y-8">
        <h1
          className="text-[32px] md:text-[48px] leading-[40px] md:leading-[56px] font-extrabold"
          style={{
            background: "linear-gradient(135deg, #ffb3ac, #7bd1f8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.04em",
          }}
        >
          Library
        </h1>

        {/* Sign in prompt if not logged in */}
        {!session && (
          <div className="rounded-xl bg-surface-container p-6 flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-[32px]">account_circle</span>
            <div className="flex-1">
              <p className="text-[16px] text-on-surface font-semibold">Sign in to see your music</p>
              <p className="text-[14px] text-on-surface-variant">
                Your YouTube Music playlists and liked songs will appear here
              </p>
            </div>
          </div>
        )}

        {/* Cookie setup instructions */}
        {setupInstructions.length > 0 && (
          <div className="rounded-xl bg-surface-container p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-tertiary text-[24px]">cookie</span>
              <p className="text-[16px] text-on-surface font-semibold">
                Connect your YouTube Music account
              </p>
            </div>
            <p className="text-[14px] text-on-surface-variant">
              To see your liked songs and playlists, export your YouTube cookies:
            </p>
            <ol className="space-y-2 text-[14px] text-on-surface-variant pl-4">
              {setupInstructions.map((step, i) => (
                <li key={i} className="list-decimal">{step.replace(/^\d+\.\s*/, '')}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto hide-scrollbar gap-3 -mx-4 px-4 md:mx-0 md:px-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-6 py-2.5 rounded-full text-[12px] leading-[16px] font-semibold tracking-[0.05em] uppercase transition-colors ${
                activeTab === tab
                  ? "bg-on-surface text-surface"
                  : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/10"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === "Playlists" && (
          <div className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex flex-col gap-3">
                    <div className="aspect-square rounded-lg bg-surface-container animate-pulse" />
                    <div className="h-4 bg-surface-container rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-surface-container rounded w-1/2 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : ytPlaylists.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {ytPlaylists.map((playlist) => (
                  <Link
                    key={playlist.id}
                    href={`/library/yt-playlist/${playlist.id}`}
                    className="group flex flex-col gap-3 cursor-pointer"
                  >
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-highest shadow-md group-hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.6)] transition-all duration-300">
                      {playlist.thumbnail ? (
                        <img
                          alt={playlist.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          src={playlist.thumbnail}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-on-surface-variant text-[40px]">
                            queue_music
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all shadow-lg">
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                          play_arrow
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[16px] leading-[24px] text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
                        {playlist.title}
                      </p>
                      <p className="text-[14px] leading-[20px] text-on-surface-variant truncate mt-0.5">
                        {playlist.trackCount} tracks
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px] mb-4">library_music</span>
                <p className="text-[16px]">
                  {session ? "No playlists found" : "Sign in to see your playlists"}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "Liked Songs" && (
          <div className="flex flex-col gap-1">
            {loading ? (
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
            ) : ytLikedSongs.length > 0 ? (
              <>
                {ytLikedSongs.map((track, i) => (
                  <TrackRow
                    key={`${track.id}-${i}`}
                    track={track}
                    tracks={ytLikedSongs}
                    index={i}
                  />
                ))}
                {/* Infinite scroll trigger */}
                {likedNextPageToken && (
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
              </>
            ) : likedTracks.length > 0 ? (
              likedTracks.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  tracks={likedTracks}
                  index={i}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px] mb-4">favorite_border</span>
                <p className="text-[16px]">No liked songs yet</p>
                <p className="text-[14px] mt-1">
                  {session ? "Your YouTube Music liked songs will appear here" : "Sign in to see liked songs"}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "Local Playlists" && (
          <div className="space-y-6">
            <button
              onClick={() => createPlaylist(`My Playlist #${localPlaylists.length + 1}`)}
              className="flex items-center gap-4 p-4 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer w-full"
            >
              <div className="w-14 h-14 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[28px]">add</span>
              </div>
              <div className="text-left">
                <p className="text-[16px] leading-[24px] text-on-surface font-semibold">New Playlist</p>
                <p className="text-[14px] leading-[20px] text-on-surface-variant">Create a local playlist</p>
              </div>
            </button>

            {localPlaylists.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {localPlaylists.map((playlist) => (
                  <Link
                    key={playlist.id}
                    href={`/playlist/${playlist.id}`}
                    className="group flex flex-col gap-3 cursor-pointer"
                  >
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-highest shadow-md">
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-surface-variant text-[40px]">queue_music</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[16px] leading-[24px] text-on-surface font-semibold truncate">{playlist.title}</p>
                      <p className="text-[14px] leading-[20px] text-on-surface-variant">{playlist.trackCount} songs</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px] mb-4">library_music</span>
                <p className="text-[16px]">No local playlists yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
