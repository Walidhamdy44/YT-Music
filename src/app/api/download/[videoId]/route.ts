import { NextRequest, NextResponse } from "next/server";

const AUDIO_BACKEND_URL =
  process.env.AUDIO_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL ||
  "http://localhost:8000";

// Stream-through approach — no buffering on the server.
// This avoids Vercel's serverless function timeout (10s on free plan)
// because we just pipe bytes through; the response starts immediately.
//
// The client (offlinePlaybackService) reads the stream chunk-by-chunk.
// Content-Length is forwarded when available so progress tracking works.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  try {
    // Use the backend's dedicated /download endpoint (buffered on the Python
    // side, then sent as a single response — so Content-Length is always set)
    const backendRes = await fetch(`${AUDIO_BACKEND_URL}/download/${videoId}`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!backendRes.ok) {
      console.error(`[Download API] Backend error: ${backendRes.status}`);
      return NextResponse.json(
        { error: "Audio fetch failed" },
        { status: backendRes.status }
      );
    }

    const contentType = backendRes.headers.get("Content-Type") || "audio/webm";
    const contentLength = backendRes.headers.get("Content-Length");

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Expose-Headers": "Content-Length, Content-Type",
    };

    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    // Stream the response body straight through — no server-side buffering
    return new NextResponse(backendRes.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[Download API] Error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
