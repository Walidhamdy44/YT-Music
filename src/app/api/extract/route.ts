import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { Innertube } from "youtubei.js";

const execAsync = promisify(exec);

let innertube: Innertube | null = null;

async function getInnertube() {
  if (!innertube) {
    innertube = await Innertube.create({ lang: "en", location: "US" });
  }
  return innertube;
}

// Cache extracted URLs to avoid re-extracting for the same track
const urlCache = new Map<string, { url: string; expiresAt: number; title: string; artist: string; duration: number; thumbnail: string }>();

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

    // Method 1: Try yt-dlp (works locally where it's installed)
    try {
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

      if (urlResult.status === "fulfilled" && urlResult.value.stdout.trim()) {
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
          client: "yt-dlp",
        });
      }
    } catch {
      // yt-dlp not available (e.g., on Vercel), fall through to next method
    }

    // Method 2: Try youtubei.js (works if YouTube doesn't block the IP)
    try {
      const yt = await getInnertube();
      const info = await yt.music.getInfo(videoId);

      if (info?.streaming_data) {
        const format = info.chooseFormat({ type: "audio", quality: "best" });
        if (format) {
          const streamUrl = await format.decipher(yt.session.player);
          if (streamUrl) {
            const title = info.basic_info?.title || "";
            const artist = info.basic_info?.author || "";
            const duration = info.basic_info?.duration || 0;
            const thumbnail =
              info.basic_info?.thumbnail?.[info.basic_info.thumbnail.length - 1]?.url ||
              info.basic_info?.thumbnail?.[0]?.url ||
              "";

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
              client: "youtubei",
            });
          }
        }
      }
    } catch (e) {
      console.log("youtubei.js failed:", e instanceof Error ? e.message : e);
      innertube = null;
    }

    // Method 3: Try Piped API instances as last resort
    const pipedInstances = [
      `https://pipedapi.kavin.rocks/streams/${videoId}`,
      `https://api.piped.yt/streams/${videoId}`,
      `https://piped-api.lunar.icu/streams/${videoId}`,
    ];

    for (const pipedUrl of pipedInstances) {
      try {
        const res = await fetch(pipedUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;

        const data = await res.json();
        const audioStreams = data.audioStreams || [];
        const bestAudio = audioStreams
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((s: any) => s.mimeType?.includes("audio"))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (bestAudio?.url) {
          const title = data.title || "";
          const artist = (data.uploader || "").replace(" - Topic", "");
          const duration = data.duration || 0;
          const thumbnail = data.thumbnailUrl || "";

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

    return NextResponse.json(
      { error: "Could not extract stream URL", details: "All methods failed" },
      { status: 503 }
    );
  } catch (error: unknown) {
    console.error("Extract error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to extract stream", details: message },
      { status: 500 }
    );
  }
}
