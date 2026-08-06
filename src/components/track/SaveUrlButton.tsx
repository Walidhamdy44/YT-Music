"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, Link2Off, Loader2, RefreshCw } from "lucide-react";
import { savedUrlStore, SavedUrlStore } from "@/lib/savedUrlStore";
import { useOfflineStore } from "@/stores/offlineStore";
import { cn } from "@/lib/utils";
import type { Track } from "@/types";

interface SaveUrlButtonProps {
  track: Track;
  size?: "sm" | "default";
  className?: string;
}

type Status = "idle" | "saving" | "saved" | "expired" | "error";

export function SaveUrlButton({ track, size = "sm", className }: SaveUrlButtonProps) {
  const isOffline = useOfflineStore((state) => state.isOffline);
  const iconSize = size === "sm" ? 16 : 20;

  const [status, setStatus] = useState<Status>("idle");
  const [expiresAt, setExpiresAt] = useState<number>(0);

  // Load current saved-url status on mount
  useEffect(() => {
    savedUrlStore.get(track.videoId).then((entry) => {
      if (!entry) { setStatus("idle"); return; }
      if (savedUrlStore.isValid(entry)) {
        setStatus("saved");
        setExpiresAt(entry.expiresAt);
      } else {
        setStatus("expired");
        setExpiresAt(entry.expiresAt);
      }
    });
  }, [track.videoId]);

  const saveUrl = useCallback(async () => {
    if (isOffline || status === "saving") return;

    setStatus("saving");
    try {
      const res = await fetch(`/api/resolve-url/${track.videoId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { url, expiresAt: exp } = await res.json();
      if (!url) throw new Error("No URL returned");

      const newEntry = SavedUrlStore.createEntry(track, url, exp ?? 0);
      await savedUrlStore.save(newEntry);

      setStatus("saved");
      setExpiresAt(exp ?? 0);
      console.log(`[SaveUrlButton] Saved URL for ${track.videoId}, expires: ${new Date(exp).toLocaleTimeString()}`);
    } catch (e) {
      console.error("[SaveUrlButton] Failed to save URL:", e);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [track, isOffline, status]);

  const removeUrl = useCallback(async () => {
    await savedUrlStore.delete(track.videoId);
    setStatus("idle");
    setExpiresAt(0);
  }, [track.videoId]);

  const expiryLabel = expiresAt
    ? `Expires at ${new Date(expiresAt).toLocaleTimeString()}`
    : "";

  if (status === "saving") {
    return (
      <button
        disabled
        className={cn("inline-flex items-center justify-center p-1 rounded-full opacity-70", className)}
        title="Saving URL..."
      >
        <Loader2 size={iconSize} className="animate-spin text-blue-400" />
      </button>
    );
  }

  if (status === "saved") {
    return (
      <button
        onClick={removeUrl}
        className={cn(
          "inline-flex items-center justify-center p-1 rounded-full hover:bg-muted/50 transition-colors",
          className
        )}
        title={`URL saved — direct stream (no backend needed)\n${expiryLabel}\nClick to remove`}
      >
        <Link2 size={iconSize} className="text-blue-400" />
      </button>
    );
  }

  if (status === "expired") {
    return (
      <button
        onClick={saveUrl}
        disabled={isOffline}
        className={cn(
          "inline-flex items-center justify-center p-1 rounded-full hover:bg-muted/50 transition-colors",
          isOffline && "opacity-50 cursor-not-allowed",
          className
        )}
        title={`URL expired — click to refresh\n${expiryLabel}`}
      >
        <RefreshCw size={iconSize} className="text-amber-400" />
      </button>
    );
  }

  if (status === "error") {
    return (
      <button
        onClick={saveUrl}
        className={cn(
          "inline-flex items-center justify-center p-1 rounded-full hover:bg-muted/50 transition-colors",
          className
        )}
        title="Failed to save URL — click to retry"
      >
        <Link2Off size={iconSize} className="text-red-400" />
      </button>
    );
  }

  // idle
  return (
    <button
      onClick={saveUrl}
      disabled={isOffline}
      className={cn(
        "inline-flex items-center justify-center p-1 rounded-full hover:bg-muted/50 transition-colors",
        isOffline && "opacity-50 cursor-not-allowed",
        className
      )}
      title={isOffline ? "Cannot save URL while offline" : "Save direct URL (stream without backend)"}
    >
      <Link2 size={iconSize} className="text-muted-foreground" />
    </button>
  );
}
