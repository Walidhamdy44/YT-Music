"use client";

import { Header } from "@/components/layout/Header";
import { TrackRow } from "@/components/track/TrackRow";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { playTrack } from "@/components/player/PlayerProvider";
import Link from "next/link";
import type { Track } from "@/types";

interface BrowseSection {
  title: string;
  type: string;
  items: Track[];
}

interface HomeSectionItem {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  playlistId?: string;
  videoId?: string;
  type: "playlist" | "album" | "artist" | "song" | "video" | "unknown";
}

interface HomeSection {
  title: string;
  items: HomeSectionItem[];
}

// Client-side cache for browse data
let browseCache: { sections: BrowseSection[]; fetchedAt: number } | null = null;
const BROWSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for home sections (mixes, etc.)
let homeSectionsCache: { data: HomeSection[]; fetchedAt: number } | null = null;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const moodChips = ["Energize", "Feel good", "Relax", "Workout", "Party", "Commute", "Focus", "Romance", "Sad", "Sleep"];

export default function HomePage() {
  const { data: session } = useSession();
  const [sections, setSections] = useState<BrowseSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeSections, setHomeSections] = useState<HomeSection[]>([]);
  const [homeSectionsLoading, setHomeSectionsLoading] = useState(true);
  const { setQueue } = useQueueStore();

  useEffect(() => {
    const loadBrowse = async () => {
      // Use cache if fresh
      if (browseCache && Date.now() - browseCache.fetchedAt < BROWSE_CACHE_TTL) {
        setSections(browseCache.sections);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/browse");
        if (res.ok) {
          const data = await res.json();
          const sections = data.sections || [];
          setSections(sections);
          browseCache = { sections, fetchedAt: Date.now() };
        }
      } catch (err) {
        console.error("Failed to load browse data:", err);
      } finally {
        setLoading(false);
      }
    };

    const loadHomeSections = async () => {
      // Use cache if fresh
      if (homeSectionsCache && Date.now() - homeSectionsCache.fetchedAt < BROWSE_CACHE_TTL) {
        setHomeSections(homeSectionsCache.data);
        setHomeSectionsLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/home-sections");
        if (res.ok) {
          const data = await res.json();
          setHomeSections(data.sections || []);
          homeSectionsCache = { data: data.sections || [], fetchedAt: Date.now() };
        }
      } catch (err) {
        console.error("Failed to load home sections:", err);
      } finally {
        setHomeSectionsLoading(false);
      }
    };

    loadBrowse();
    loadHomeSections();
  }, []);

  const listenAgain = sections.find((s) => s.type === "listen_again");
  const forgottenFavorites = sections.find((s) => s.type === "forgotten_favorites");
  const albumsForYou = sections.find((s) => s.type === "albums_for_you");
  const quickPicks = sections.find((s) => s.title === "Quick picks");
  const otherSections = sections.filter((s) =>
    s.type !== "listen_again" &&
    s.type !== "forgotten_favorites" &&
    s.type !== "albums_for_you" &&
    s.title !== "Quick picks"
  );

  const handlePlayTrack = (track: Track, trackList: Track[], index: number) => {
    setQueue(trackList, index);
    playTrack(track);
  };

  return (
    <>
      <Header />
      <div className="px-4 md:px-8 py-6 space-y-10">
        {/* Fresh finds, old favorites — Personalized YT Music mixes (only when signed in) */}
        {session && homeSectionsLoading ? (
          <section>
            <div className="h-7 bg-surface-container rounded w-64 animate-pulse mb-4" />
            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex-shrink-0 w-[180px]">
                  <div className="aspect-square rounded-lg bg-surface-container animate-pulse mb-2" />
                  <div className="h-4 bg-surface-container rounded w-3/4 animate-pulse mb-1" />
                  <div className="h-3 bg-surface-container rounded w-1/2 animate-pulse" />
                </div>
              ))}
            </div>
          </section>
        ) : homeSections.length > 0 ? (
          homeSections.map((homeSection) => (
            <section key={homeSection.title}>
              <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface mb-4">
                {homeSection.title}
              </h2>
              <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                {homeSection.items.map((item) => {
                  const href =
                    item.type === "album" && item.playlistId
                      ? `/album/${item.playlistId}`
                      : item.type === "playlist" && item.playlistId
                      ? `/yt-playlist/${item.playlistId}`
                      : item.type === "song" && item.videoId
                      ? "#"
                      : "#";

                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className="flex-shrink-0 w-[180px] group cursor-pointer"
                    >
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-highest mb-2 shadow-md group-hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.6)] transition-all duration-300">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-surface-container">
                            <span className="material-symbols-outlined text-on-surface-variant text-[40px]">
                              {item.type === "album" ? "album" : item.type === "artist" ? "person" : "queue_music"}
                            </span>
                          </div>
                        )}
                        <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all shadow-lg">
                          <span
                            className="material-symbols-outlined"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            play_arrow
                          </span>
                        </div>
                      </div>
                      <p className="text-[14px] leading-[20px] text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
                        {item.title}
                      </p>
                      <p className="text-[12px] leading-[16px] text-on-surface-variant truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        ) : null}

        {/* Mood Chips */}
        <div className="flex gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {moodChips.map((chip) => (
            <button
              key={chip}
              className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-[14px] leading-[20px] whitespace-nowrap transition-colors border border-outline-variant/30"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Listen Again Section - Horizontal cards like real YT Music */}
        {listenAgain && listenAgain.items.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              {session?.user?.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full"
                />
              )}
              <div>
                {session?.user?.name && (
                  <p className="text-[12px] leading-[16px] font-semibold tracking-[0.05em] text-on-surface-variant uppercase">
                    {session.user.name}
                  </p>
                )}
                <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface">
                  Listen again
                </h2>
              </div>
            </div>

            {/* Horizontal scroll cards */}
            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
              {listenAgain.items.map((track, i) => (
                <div
                  key={track.id}
                  className="flex-shrink-0 w-[180px] group cursor-pointer"
                  onClick={() => handlePlayTrack(track, listenAgain.items, i)}
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-highest mb-2 shadow-md">
                    {track.thumbnail ? (
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-container">
                        <span className="material-symbols-outlined text-on-surface-variant text-[40px]">music_note</span>
                      </div>
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                        <span className="material-symbols-outlined text-black text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          play_arrow
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[14px] leading-[20px] text-on-surface font-semibold truncate">
                    {track.title}
                  </p>
                  <p className="text-[12px] leading-[16px] text-on-surface-variant truncate">
                    Song • {track.artist}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick Picks Section */}
        {(quickPicks || loading) && (
          <section>
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-[12px] leading-[16px] font-semibold tracking-widest text-on-surface-variant mb-1 uppercase">
                  Start Radio from a Song
                </p>
                <h3 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface">
                  Quick picks
                </h3>
              </div>
              {quickPicks && quickPicks.items.length > 0 && (
                <button
                  onClick={() => {
                    if (quickPicks.items.length > 0) {
                      setQueue(quickPicks.items, 0);
                      playTrack(quickPicks.items[0]);
                    }
                  }}
                  className="text-on-surface-variant hover:text-on-surface text-sm border border-outline-variant/50 px-3 py-1 rounded-full transition-colors"
                >
                  Play all
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex gap-4 overflow-x-auto hide-scrollbar">
                {[1, 2].map((col) => (
                  <div key={col} className="flex flex-col gap-3 min-w-[300px] w-[360px]">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <div className="w-12 h-12 rounded bg-surface-container animate-pulse" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-surface-container rounded w-3/4 animate-pulse" />
                          <div className="h-3 bg-surface-container rounded w-1/2 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : quickPicks ? (
              <div className="flex gap-4 overflow-x-auto hide-scrollbar snap-x pb-2">
                {chunkArray(quickPicks.items, 4).map((chunk, colIdx) => (
                  <div
                    key={colIdx}
                    className="flex flex-col gap-1 min-w-[300px] w-[300px] md:min-w-[360px] md:w-[360px] snap-start"
                  >
                    {chunk.map((track, i) => (
                      <TrackRow
                        key={track.id || i}
                        track={track}
                        tracks={quickPicks.items}
                        index={colIdx * 4 + i}
                        showDuration={false}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {/* Forgotten Favorites — horizontal cards */}
        {forgottenFavorites && forgottenFavorites.items.length > 0 && (
          <section>
            <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface mb-4">
              Forgotten favorites
            </h2>
            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
              {forgottenFavorites.items.map((track, i) => (
                <div
                  key={track.id}
                  className="flex-shrink-0 w-[180px] group cursor-pointer"
                  onClick={() => handlePlayTrack(track, forgottenFavorites.items, i)}
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-highest mb-2 shadow-md">
                    {track.thumbnail ? (
                      <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-container">
                        <span className="material-symbols-outlined text-on-surface-variant text-[40px]">music_note</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                        <span className="material-symbols-outlined text-black text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[14px] leading-[20px] text-on-surface font-semibold truncate">{track.title}</p>
                  <p className="text-[12px] leading-[16px] text-on-surface-variant truncate">{track.artist}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Albums for you — horizontal cards */}
        {albumsForYou && albumsForYou.items.length > 0 && (
          <section>
            <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface mb-4">
              Albums for you
            </h2>
            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
              {albumsForYou.items.map((album, i) => (
                <Link
                  key={album.id || i}
                  href={`/album/${album.id}`}
                  className="flex-shrink-0 w-[180px] group cursor-pointer"
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-highest mb-2 shadow-md group-hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.6)] transition-all duration-300">
                    {album.thumbnail ? (
                      <img src={album.thumbnail} alt={album.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-container">
                        <span className="material-symbols-outlined text-on-surface-variant text-[40px]">album</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all shadow-lg">
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  </div>
                  <p className="text-[14px] leading-[20px] text-on-surface font-semibold truncate group-hover:text-primary transition-colors">{album.title}</p>
                  <p className="text-[12px] leading-[16px] text-on-surface-variant truncate">Album • {album.artist}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Other sections */}
        {otherSections.map((section) => (
          <section key={section.title}>
            <h3 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface mb-4">
              {section.title}
            </h3>
            <div className="flex flex-col gap-1">
              {section.items.slice(0, 8).map((track, i) => (
                <TrackRow
                  key={track.id || i}
                  track={track}
                  tracks={section.items}
                  index={i}
                />
              ))}
            </div>
          </section>
        ))}

        {/* Empty state */}
        {!loading && sections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-4">music_note</span>
            <p className="text-[16px]">Loading your music...</p>
          </div>
        )}
      </div>
    </>
  );
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
