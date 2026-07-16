"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useUIStore } from "@/stores/uiStore";

export function Header() {
  const router = useRouter();
  const { data: session } = useSession();
  const { searchQuery, setSearchQuery, addToSearchHistory } = useUIStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) {
      setSearchQuery(localQuery.trim());
      addToSearchHistory(localQuery.trim());
      router.push(`/search?q=${encodeURIComponent(localQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-transparent">
      <div className="flex justify-between items-center px-4 md:px-8 h-16 w-full">
        {/* Mobile Logo */}
        <div className="md:hidden flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-2xl">play_circle</span>
          <span className="text-[24px] leading-[32px] font-bold tracking-tight">Music</span>
        </div>

        {/* Desktop Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-4 hidden md:block">
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              className="w-full bg-surface-container text-on-surface rounded-full py-2 pl-12 pr-4 border-none focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-on-surface-variant text-[14px] leading-[20px]"
              placeholder="Search songs, albums, artists, podcasts"
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
            />
          </div>
        </form>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <Link
            href="/search"
            className="md:hidden text-on-surface p-2 hover:bg-surface-container-highest rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">search</span>
          </Link>
          <button className="text-on-surface p-2 hover:bg-surface-container-highest rounded-full transition-colors">
            <span className="material-symbols-outlined">cast</span>
          </button>

          {/* User Avatar / Sign In */}
          <div className="relative" ref={menuRef}>
            {session?.user ? (
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant hover:border-primary transition-colors"
              >
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-primary flex items-center justify-center text-on-primary text-[14px] font-bold">
                    {session.user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
              </button>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-container/20 hover:bg-primary-container/30 text-primary text-[12px] font-semibold tracking-[0.05em] uppercase transition-colors"
              >
                Sign in
              </button>
            )}

            {/* Dropdown Menu */}
            {showMenu && session?.user && (
              <div className="absolute right-0 top-12 w-64 bg-surface-container-high rounded-xl border border-outline-variant/20 shadow-[0_16px_32px_-8px_rgba(0,0,0,0.6)] overflow-hidden z-50">
                <div className="p-4 border-b border-outline-variant/20">
                  <p className="text-[14px] text-on-surface font-semibold truncate">
                    {session.user.name}
                  </p>
                  <p className="text-[12px] text-on-surface-variant truncate">
                    {session.user.email}
                  </p>
                </div>
                <div className="py-2">
                  <Link
                    href="/library"
                    onClick={() => setShowMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-highest transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      library_music
                    </span>
                    <span className="text-[14px] text-on-surface">Your Library</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-highest transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      logout
                    </span>
                    <span className="text-[14px] text-on-surface">Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
