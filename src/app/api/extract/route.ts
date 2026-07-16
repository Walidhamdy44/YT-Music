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

    // Try multiple clients — some work better from server IPs
    const clients = ["WEB_EMBEDDED", "YTMUSIC", "WEB", "ANDROID", "IOS"] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let info: any = null;
    let usedClient = "";

    for (const client of clients) {
      try {
        if (client === "YTMUSIC") {
          info = await yt.music.getInfo(videoId);
        } else {
          info = await yt.getInfo(videoId, { client });
        }
        if (info?.streaming_data) {
          usedClient = client;
          break;
        }
      } catch (e) {
        console.log(`Client ${client} failed for ${videoId}:`, e instanceof Error ? e.message : "");
        continue;
      }
    }

    if (!info?.streaming_data) {
      // Fallback: try multiple Piped/Invidious API instances
      const proxyInstances = [
        { url: `https://pipedapi.kavin.rocks/streams/${videoId}`, type: "piped" },
        { url: `https://pipedapi.adminforge.de/streams/${videoId}`, type: "piped" },
        { url: `https://api.piped.yt/streams/${videoId}`, type: "piped" },
        { url: `https://piped-api.lunar.icu/streams/${videoId}`, type: "piped" },
      ];

      for (const instance of proxyInstances) {
        try {
          const proxyRes = await fetch(instance.url, { signal: AbortSignal.timeout(8000) });
          if (!proxyRes.ok) continue;
          const proxyData = await proxyRes.json();

          const audioStreams = proxyData.audioStreams || [];
          const bestAudio = audioStreams
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((s: any) => s.mimeType?.includes("audio"))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

          if (bestAudio?.url) {
            const title = proxyData.title || "";
            const artist = (proxyData.uploader || "").replace(" - Topic", "");
            const duration = proxyData.duration || 0;
            const thumbnail = proxyData.thumbnailUrl || "";

            const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
            urlCache.set(videoId, { url: bestAudio.url, expiresAt, title, artist, duration, thumbnail });

            return NextResponse.json({
              url: bestAudio.url,
              mimeType: bestAudio.mimeType || "audio/mp4",
              bitrate: bestAudio.bitrate || 128000,
              duration,
              expiresAt,
              videoId,
              title,
              artist,
              thumbnail,
              cached: false,
              client: "piped",
            });
          }
        } catch {
          continue;
        }
      }

      return NextResponse.json({
        error: "Streaming data not available",
        details: "All extraction methods failed. YouTube blocks server-side requests from cloud providers.",
      }, { status: 503 });
    }

    // Choose the best audio format
    let format;
    try {
      format = info.chooseFormat({ type: "audio", quality: "best" });
    } catch {
      try {
        format = info.chooseFormat({ quality: "best" });
      } catch {
        return NextResponse.json(
          { error: "No suitable format found" },
          { status: 404 }
        );
      }
    }

    if (!format) {
      return NextResponse.json(
        { error: "Could not find audio format" },
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

    // Cache for 4 hours
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
      client: usedClient,
    });
  } catch (error: unknown) {
    console.error("Extract error:", error);
    innertube = null;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to extract stream", details: message },
      { status: 500 }
    );
  }
}
