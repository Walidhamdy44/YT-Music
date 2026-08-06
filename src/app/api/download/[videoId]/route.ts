import { NextRequest, NextResponse } from "next/server";

const AUDIO_BACKEND_URL =
  process.env.AUDIO_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL ||
  "http://localhost:8000";

export const maxDuration = 300; // 5 minutes

/**
 * Download endpoint — buffers the entire audio on the server then sends it
 * in one response so the browser gets a proper Content-Length and can track
 * progress via the ReadableStream reader.
 *
 * DO NOT use this for playback (use /api/audio instead).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  try {
    console.log(`[Download API] Buffering audio for ${videoId}`);

    const backendRes = await fetch(`${AUDIO_BACKEND_URL}/audio/${videoId}`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!backendRes.ok) {
      console.error(`[Download API] Backend error: ${backendRes.status}`);
      return NextResponse.json(
        { error: "Audio fetch failed" },
        { status: backendRes.status }
      );
    }

    // Buffer the whole thing so we know the exact byte count
    const buffer = await backendRes.arrayBuffer();
    const contentType =
      backendRes.headers.get("Content-Type") || "audio/webm";

    console.log(
      `[Download API] Buffered ${buffer.byteLength} bytes for ${videoId}`
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Exact byte count — this is what allows the browser to show progress
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": "attachment",
        "Cache-Control": "private, max-age=3600",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type",
      },
    });
  } catch (err) {
    console.error("[Download API] Error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
