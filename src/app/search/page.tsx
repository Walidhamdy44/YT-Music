"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { TrackRow } from "@/components/track/TrackRow";
import { AlbumCard } from "@/components/track/AlbumCard";
import { useUIStore } from "@/stores/uiStore";
import { useQueueStore } from "@/stores/queueStore";
import { playTrack } from "@/components/player/PlayerProvider";
import type { Track, Album, Artist } from "@/types";

const filterTabs = ["All", "Songs", "Albums", "Artists", "Playlists"];

interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const { setSearchQuery, addToSearchHistory } = useUIStore();
  const { setQueue } = useQueueStore();
  const [activeFilter, setActiveFilter] = useState("All");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    if (query) {
      setLocalQuery(query);
      setSearchQuery(query);
      performSearch(query);
    }
  }, [query]);

  const performSearch = async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        setResults(null);
      }
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) {
      addToSearchHistory(localQuery.trim());
      router.push(`/search?q=${encodeURIComponent(localQuery.trim())}`);
    }
  };

  const handlePlayAll = (tracks: Track[]) => {
    if (tracks.length > 0) {
      setQueue(tracks, 0);
      playTrack(tracks[0]);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Search Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md">
        <div className="flex justify-between items-center px-4 md:px-8 h-16 w-full">
          <form onSubmit={handleSearch} className="flex-1 max-w-2xl">
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">
                search
              </span>
              <input
                className="w-full bg-surface-container text-on-surface rounded-full py-3 pl-12 pr-12 border-none focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-on-surface-variant text-[16px] leading-[24px]"
                placeholder="Search songs, albums, artists..."
                type="text"
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                autoFocus
              />
              {localQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalQuery("");
                    router.push("/search");
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </header>

      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 flex flex-col gap-8 py-6">
        {/* Filter Tabs */}
        <div className="flex overflow-x-auto hide-scrollbar gap-3 -mx-4 px-4 md:mx-0 md:px-0">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`whitespace-nowrap px-6 py-2.5 rounded-full text-[12px] leading-[16px] font-semibold tracking-[0.05em] uppercase transition-colors ${
                activeFilter === tab
                  ? "bg-on-surface text-surface"
                  : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/10"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <div className="w-12 h-12 rounded bg-surface-container animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-container rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-surface-container rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && results && (
          <div className="space-y-10">
            {/* Top Result + Songs Grid */}
            {(activeFilter === "All" || activeFilter === "Songs") && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Result Artist */}
                {activeFilter === "All" && results.artists.length > 0 && (
                  <section className="lg:col-span-1 flex flex-col gap-4">
                    <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface">
                      Top Result
                    </h2>
                    <TopResultCard artist={results.artists[0]} />
                  </section>
                )}

                {/* Songs */}
                {results.tracks.length > 0 && (
                  <section className={activeFilter === "All" && results.artists.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface">
                        Songs
                      </h2>
                      {results.tracks.length > 0 && (
                        <button
                          onClick={() => handlePlayAll(results.tracks)}
                          className="text-on-surface-variant hover:text-on-surface text-sm border border-outline-variant/50 px-3 py-1 rounded-full transition-colors"
                        >
                          Play all
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {results.tracks.slice(0, activeFilter === "Songs" ? 20 : 5).map((track, i) => (
                        <TrackRow
                          key={track.id || i}
                          track={track}
                          tracks={results.tracks}
                          index={i}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Albums */}
            {(activeFilter === "All" || activeFilter === "Albums") && results.albums.length > 0 && (
              <section>
                <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface mb-6">
                  Albums
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {results.albums.slice(0, activeFilter === "Albums" ? 20 : 5).map((album) => (
                    <AlbumCard key={album.id} album={album} />
                  ))}
                </div>
              </section>
            )}

            {/* Artists */}
            {(activeFilter === "All" || activeFilter === "Artists") && results.artists.length > 0 && (
              <section>
                <h2 className="text-[24px] leading-[32px] font-bold tracking-tight text-on-surface mb-6">
                  Artists
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {results.artists.slice(0, activeFilter === "Artists" ? 20 : 5).map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} />
                  ))}
                </div>
              </section>
            )}

            {/* No results */}
            {results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px] mb-4">search_off</span>
                <p className="text-[16px]">No results found for &quot;{query}&quot;</p>
                <p className="text-[14px] mt-1">Try different keywords or check spelling</p>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !results && !query && (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-4">search</span>
            <p className="text-[16px]">Search for songs, albums, and artists</p>
            <p className="text-[14px] mt-1">Play anything without restrictions</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TopResultCard({ artist }: { artist: Artist }) {
  return (
    <div className="group relative rounded-xl overflow-hidden bg-surface-container hover:bg-surface-container-high transition-all duration-300 p-6 flex flex-col gap-4 cursor-pointer hover:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]">
      <div className="w-32 h-32 rounded-full overflow-hidden self-center mb-2 shadow-xl ring-1 ring-white/5">
        {artist.thumbnail ? (
          <img alt={artist.name} className="w-full h-full object-cover" src={artist.thumbnail} />
        ) : (
          <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">person</span>
          </div>
        )}
      </div>
      <div className="text-center">
        <h3 className="text-[28px] font-bold text-on-surface mb-1">{artist.name}</h3>
        <p className="text-[14px] leading-[20px] text-on-surface-variant">
          Artist{artist.subscribers ? ` • ${artist.subscribers}` : ""}
        </p>
      </div>
      <div className="mt-4 flex gap-3 justify-center">
        <button className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            play_arrow
          </span>
        </button>
        <button className="w-12 h-12 rounded-full border border-outline-variant text-on-surface flex items-center justify-center hover:bg-surface-container-highest transition-colors">
          <span className="material-symbols-outlined">shuffle</span>
        </button>
      </div>
    </div>
  );
}

function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <div className="group flex flex-col items-center gap-3 cursor-pointer">
      <div className="relative w-full aspect-square rounded-full overflow-hidden bg-surface-container-highest shadow-md group-hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.6)] transition-all duration-300">
        {artist.thumbnail ? (
          <img alt={artist.name} className="w-full h-full object-cover" src={artist.thumbnail} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-[40px]">person</span>
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-[16px] leading-[24px] text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
          {artist.name}
        </p>
        <p className="text-[14px] leading-[20px] text-on-surface-variant truncate mt-0.5">
          Artist
        </p>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <SearchContent />
    </Suspense>
  );
}
