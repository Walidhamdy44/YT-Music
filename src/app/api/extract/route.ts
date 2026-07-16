import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Cache extracted URLs to avoid re-running yt-dlp for the same track
const urlCache = new Map<string, { url: string; expiresAt: number; title: string; artist: string; duration: number; thumbnail: string }>();

// Clean expired cache entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of urlCache.entries()) {
    if (value.expiresAt < now) {
      urlCache.delete(key);
    }
  }
}, 30 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json();

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId is required" },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json(
        { error: "Invalid videoId format", details: `Got: ${videoId}` },
        { status: 400 }
      );
    }

    // Check cache first
    const cached = urlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        url: cached.url,
        mimeType: "audio/mp4",
        bitrate: 128000,
        duration: cached.duration,
        expiresAt: cached.expiresAt,
        videoId,
        title: cached.title,
        artist: cached.artist,
        thumbnail: cached.thumbnail,
        cached: true,
      });
    }

    const ytUrl = `https://music.youtube.com/watch?v=${videoId}`;

    // Run URL extraction and metadata fetch in parallel for speed
    const [urlResult, infoResult] = await Promise.allSettled([
      execAsync(
        `yt-dlp -f "bestaudio[ext=m4a]/bestaudio/best" -g --no-warnings --no-check-certificates "${ytUrl}"`,
        { timeout: 15000 }
      ),
      execAsync(
        `yt-dlp -j --no-warnings --no-check-certificates "${ytUrl}"`,
        { timeout: 15000 }
      ),
    ]);

    if (urlResult.status !== "fulfilled" || !urlResult.value.stdout.trim()) {
      return NextResponse.json(
        { error: "Could not extract stream URL" },
        { status: 404 }
      );
    }

    const streamUrl = urlResult.value.stdout.trim();

    let title = "";
    let artist = "";
    let duration = 0;
    let thumbnail = "";

    if (infoResult.status === "fulfilled") {
      try {
        const info = JSON.parse(infoResult.value.stdout);
        title = info.title || "";
        artist = info.artist || info.uploader || info.channel || "";
        duration = info.duration || 0;
        thumbnail =
          info.thumbnail ||
          info.thumbnails?.[info.thumbnails.length - 1]?.url ||
          "";
      } catch {
        // JSON parse failed, ignore
      }
    }

    // Cache for 4 hours (URLs typically last 6 hours)
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
    urlCache.set(videoId, { url: streamUrl, expiresAt, title, artist, duration, thumbnail });

    return NextResponse.json({
      url: streamUrl,
      mimeType: "audio/mp4",
      bitrate: 128000,
      duration,
      expiresAt,
      videoId,
      title,
      artist,
      thumbnail,
      cached: false,
    });
  } catch (error: unknown) {
    console.error("Extract error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to extract stream", details: message },
      { status: 500 }
    );
  }
}
