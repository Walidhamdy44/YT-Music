"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/libraryStore";

const navItems = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/explore", icon: "explore", label: "Explore" },
  { href: "/library", icon: "library_music", label: "Library" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { playlists, createPlaylist } = useLibraryStore();

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-[240px] z-40 py-8 bg-surface-container-low border-r border-outline-variant/20">
      {/* Logo */}
      <div className="px-6 mb-8 flex items-center gap-3">
        <span className="material-symbols-outlined text-primary text-3xl flex-shrink-0">
          play_circle
        </span>
        <h1 className="text-primary text-xl font-extrabold tracking-tighter whitespace-nowrap">
          YouTube Music
        </h1>
      </div>

      {/* Nav Links */}
      <div className="flex-1 px-4 space-y-2 overflow-y-auto hide-scrollbar">
        {navItems.map(({ href, icon, label }) => {
          const isActive = pathname === href || (href === "/" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 ease-in-out",
                isActive
                  ? "text-primary border-l-2 border-primary-container bg-surface-container-highest"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              )}
            >
              <span
                className="material-symbols-outlined"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {icon}
              </span>
              <span className={cn("text-[14px] leading-[20px]", isActive && "font-semibold")}>
                {label}
              </span>
            </Link>
          );
        })}

        <div className="my-6 border-t border-outline-variant/20" />

        <button
          onClick={() => createPlaylist(`My Playlist #${playlists.length + 1}`)}
          className="w-full flex items-center gap-3 px-4 py-2 mt-4 text-primary bg-primary-container/10 hover:bg-primary-container/20 rounded-full transition-colors"
        >
          <span className="material-symbols-outlined">add</span>
          <span className="text-[12px] leading-[16px] font-semibold tracking-[0.05em] uppercase">
            New Playlist
          </span>
        </button>
      </div>

      {/* Bottom Links */}
      <div className="px-4 mt-auto">
        <Link
          href="#"
          className="flex items-center gap-4 px-4 py-3 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-all duration-200 ease-in-out"
        >
          <span className="material-symbols-outlined">settings</span>
          <span className="text-[14px] leading-[20px]">Settings</span>
        </Link>
        <Link
          href="#"
          className="flex items-center gap-4 px-4 py-3 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-all duration-200 ease-in-out"
        >
          <span className="material-symbols-outlined">help</span>
          <span className="text-[14px] leading-[20px]">Help</span>
        </Link>
      </div>
    </aside>
  );
}
