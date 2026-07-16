/**
 * Client-side audio stream extraction.
 * Uses a CORS proxy to fetch YouTube's player response from the browser,
 * bypassing data center IP blocks since the request originates from the user's IP.
 */

interface ExtractResult {
  url: string;
  mimeType: string;
  bitrate: number;
  duration: number;
  expiresAt: number;
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  cached: boolean;
  client: string;
}

// Simple URL cache
const clientCache = new Map<string, { data: ExtractResult; expiresAt: number }>();

export async function clientExtract(videoId: string): Promise<ExtractResult | null> {
  // Check cache
  const cached = clientCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, cached: true };
  }

  // Use the server's /api/extract first (works locally with yt-dlp)
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.url && !data.fallback && !data.error) {
        clientCache.set(videoId, { data, expiresAt: data.expiresAt || Date.now() + 3600000 });
        return data;
      }
    }
  } catch {
    // Server extraction failed, try client-side
  }

  // Fallback: extract via Invidious/Piped instances from the browser
  // (browser requests come from user's residential IP — not blocked by YouTube)
  const instances = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://api.piped.yt/streams/${videoId}`,
    `https://piped-api.lunar.icu/streams/${videoId}`,
    `https://pipedapi.in.projectsegfau.lt/streams/${videoId}`,
  ];

  for (const url of instances) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) continue;

      const data = await res.json();
      const audioStreams = data.audioStreams || [];

      // Find best audio stream
      const bestAudio = audioStreams
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((s: any) => s.mimeType?.includes("audio"))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

      if (bestAudio?.url) {
        const result: ExtractResult = {
          url: bestAudio.url,
          mimeType: bestAudio.mimeType || "audio/mp4",
          bitrate: bestAudio.bitrate || 128000,
          duration: data.duration || 0,
          expiresAt: Date.now() + 4 * 60 * 60 * 1000,
          videoId,
          title: data.title || "",
          artist: (data.uploader || "").replace(" - Topic", ""),
          thumbnail: data.thumbnailUrl || "",
          cached: false,
          client: "piped-client",
        };

        clientCache.set(videoId, { data: result, expiresAt: result.expiresAt });
        return result;
      }
    } catch {
      continue;
    }
  }

  return null;
}
