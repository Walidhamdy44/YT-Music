import { NextRequest, NextResponse } from "next/server";
import { Innertube, Platform } from "youtubei.js";
import vm from "node:vm";

// Provide a JavaScript evaluator for URL deciphering
// youtubei.js v17+ requires this to be set manually
const originalShim = Platform.shim;
Platform.load({
  ...originalShim,
  eval(data, env) {
    // The generated script contains top-level return statements,
    // so we wrap it in a function and execute it using vm.compileFunction
    const keys = Object.keys(env);
    const values = keys.map((k) => env[k]);
    const fn = vm.compileFunction(data.output, keys, {
      parsingContext: vm.createContext({}),
    });
    return fn(...values) as Record<string, unknown>;
  },
});

// Cache extracted URLs to avoid re-fetching for the same track
const urlCache = new Map<
  string,
  {
    url: string;
    expiresAt: number;
    title: string;
    artist: string;
    duration: number;
    thumbnail: string;
  }
>();

// Singleton Innertube instance
let innertubeInstance: Awaited<ReturnType<typeof Innertube.create>> | null =
  null;

async function getInnertube() {
  if (!innertubeInstance) {
    innertubeInstance = await Innertube.create({
      retrieve_player: true,
      enable_safety_mode: false,
      generate_session_locally: true,
    });
  }
  return innertubeInstance;
}

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

    const innertube = await getInnertube();

    // Get video info using YTMUSIC client
    const info = await innertube.getBasicInfo(videoId, { client: "YTMUSIC" });

    if (!info) {
      return NextResponse.json(
        { error: "Could not get video info" },
        { status: 404 }
      );
    }

    // Get the best audio stream URL
    const streamingData = info.streaming_data;

    if (!streamingData) {
      return NextResponse.json(
        { error: "Could not extract stream URL", details: "No streaming data available" },
        { status: 404 }
      );
    }

    // Try adaptive formats first (audio-only), then regular formats
    const audioFormats = [
      ...(streamingData.adaptive_formats || []),
      ...(streamingData.formats || []),
    ].filter((f) => f.mime_type?.startsWith("audio/"));

    // Sort by bitrate to get best quality
    audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    let streamUrl: string | null = null;
    let mimeType = "audio/mp4";
    let bitrate = 128000;

    // Try to get a decipher'd URL from the best audio format
    for (const format of audioFormats) {
      const url = await format.decipher(innertube.session.player);
      if (url) {
        streamUrl = url;
        mimeType = format.mime_type || "audio/mp4";
        bitrate = format.bitrate || 128000;
        break;
      }
    }

    // Fallback: try all formats if no audio-only found
    if (!streamUrl) {
      const allFormats = [
        ...(streamingData.adaptive_formats || []),
        ...(streamingData.formats || []),
      ];
      for (const format of allFormats) {
        const url = await format.decipher(innertube.session.player);
        if (url) {
          streamUrl = url;
          mimeType = format.mime_type || "audio/mp4";
          bitrate = format.bitrate || 128000;
          break;
        }
      }
    }

    if (!streamUrl) {
      return NextResponse.json(
        { error: "Could not extract stream URL", details: "No playable formats found" },
        { status: 404 }
      );
    }

    // Extract metadata
    const title =
      info.basic_info?.title || "";
    const artist =
      info.basic_info?.author || "";
    const duration = info.basic_info?.duration || 0;
    const thumbnail =
      info.basic_info?.thumbnail?.[0]?.url || "";

    // Cache for 4 hours (URLs typically last 6 hours)
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
    urlCache.set(videoId, {
      url: streamUrl,
      expiresAt,
      title,
      artist,
      duration,
      thumbnail,
    });

    return NextResponse.json({
      url: streamUrl,
      mimeType,
      bitrate,
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
