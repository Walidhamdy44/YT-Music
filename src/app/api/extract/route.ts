import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

let innertube: Innertube | null = null;

async function getInnertube() {
  if (!innertube) {
    innertube = await Innertube.create({ lang: "en", location: "US" });
  }
  return innertube;
}

// In-memory cache for extracted URLs
const urlCache = new Map<
  string,
  { url: string; expiresAt: number; title: string; artist: string; duration: number; thumbnail: string }
>();

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

    const yt = await getInnertube();

    // Get track info using youtubei.js
    const info = await yt.music.getInfo(videoId);

    if (!info) {
      return NextResponse.json(
        { error: "Could not fetch track info" },
        { status: 404 }
      );
    }

    // Choose the best audio format
    const format = info.chooseFormat({
      type: "audio",
      quality: "best",
    });

    if (!format) {
      return NextResponse.json(
        { error: "Could not extract stream URL" },
        { status: 404 }
      );
    }

    // Get the streaming URL
    const streamUrl = await format.decipher(yt.session.player);

    if (!streamUrl) {
      return NextResponse.json(
        { error: "Could not decipher stream URL" },
        { status: 404 }
      );
    }

    // Extract metadata
    const title = info.basic_info?.title || "";
    const artist = info.basic_info?.author || "";
    const duration = info.basic_info?.duration || 0;
    const thumbnail =
      info.basic_info?.thumbnail?.[info.basic_info.thumbnail.length - 1]?.url ||
      info.basic_info?.thumbnail?.[0]?.url ||
      "";

    // Cache for 4 hours (URLs typically last 6 hours)
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
    urlCache.set(videoId, { url: streamUrl, expiresAt, title, artist, duration, thumbnail });

    return NextResponse.json({
      url: streamUrl,
      mimeType: format.mime_type || "audio/mp4",
      bitrate: format.bitrate || 128000,
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
    innertube = null; // Reset on error
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to extract stream", details: message },
      { status: 500 }
    );
  }
}
