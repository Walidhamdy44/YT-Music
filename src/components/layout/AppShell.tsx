"use client";

import { SessionProvider } from "next-auth/react";
import { Sidebar } from "./Sidebar";
import { MiniPlayer } from "../player/MiniPlayer";
import { FullscreenPlayer } from "../player/FullscreenPlayer";
import { MobileNav } from "./MobileNav";
import { PlayerProvider } from "../player/PlayerProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlayerProvider>
        <div className="flex h-screen overflow-hidden text-on-surface">
          <Sidebar />
          <main className="flex-1 ml-0 md:ml-[240px] pb-40 md:pb-24 overflow-y-auto h-full relative">
            {children}
          </main>
          <MiniPlayer />
          <MobileNav />
          <FullscreenPlayer />
        </div>
      </PlayerProvider>
    </SessionProvider>
  );
}
