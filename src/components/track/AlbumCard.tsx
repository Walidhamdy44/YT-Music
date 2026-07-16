"use client";

import Link from "next/link";
import type { Album } from "@/types";

interface AlbumCardProps {
  album: Album;
}

export function AlbumCard({ album }: AlbumCardProps) {
  return (
    <Link
      href={`/album/${album.id}`}
      className="group flex flex-col gap-3 cursor-pointer"
    >
      <div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-highest shadow-md group-hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.6)] transition-all duration-300">
        {album.thumbnail ? (
          <img
            alt={album.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            src={album.thumbnail}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-[40px]">
              album
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
      <div>
        <p className="text-[16px] leading-[24px] text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
          {album.title}
        </p>
        <p className="text-[14px] leading-[20px] text-on-surface-variant truncate mt-0.5">
          {album.type === "album" ? "Album" : album.type === "single" ? "Single" : "EP"}
          {album.year ? ` • ${album.year}` : ""}
        </p>
      </div>
    </Link>
  );
}
