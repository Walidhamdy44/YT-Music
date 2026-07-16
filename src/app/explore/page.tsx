"use client";

import { Header } from "@/components/layout/Header";
import { TrackRow } from "@/components/track/TrackRow";
import { useEffect, useState } from "react";
import type { Track } from "@/types";

interface BrowseSection {
  title: string;
  type: string;
  items: Track[];
}

export default function ExplorePage() {
  const [sections, setSections] = useState<BrowseSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBrowse = async () => {
      try {
        const res = await fetch("/api/browse");
        if (res.ok) {
          const data = await res.json();
          setSections(data.sections || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    loadBrowse();
  }, []);

  return (
    <>
      <Header />
      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 space-y-12">
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
          Explore
        </h1>

        {loading ? (
          <div className="space-y-8">
            {[1, 2, 3].map((s) => (
              <div key={s}>
                <div className="h-8 bg-surface-container rounded w-48 mb-4 animate-pulse" />
                <div className="space-y-2">
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
              </div>
            ))}
          </div>
        ) : (
          sections.map((section) => (
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
          ))
        )}

        {!loading && sections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-4">explore</span>
            <p className="text-[16px]">Explore is loading...</p>
            <p className="text-[14px] mt-1">Check your connection or try refreshing</p>
          </div>
        )}
      </div>
    </>
  );
}
