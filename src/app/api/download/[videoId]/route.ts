import { NextRequest, NextResponse } from "next/server";

const AUDIO_BACKEND_URL =
  process.env.AUDIO_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL ||
  "http://localhost:8000";

/**
 * Download proxy — streams audio from the Python backend's /download endpoint.
 *
 * The Python /download endpoint now streams (not buffers) but still sends
 * Content-Length from the YouTube CDN.  We forward it here.
 *
 * NOTE: Vercel may strip Content-Length on streaming NextResponse bodies.
 * To guarantee it reaches the browser we also add it to
 * Access-Control-Expose-Headers so JS fetch() can read it via CORS.
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
    const backendRes = await fetch(`${AUDIO_BACKEND_URL}/download/${videoId}`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: "Audio fetch failed" },
        { status: backendRes.status }
      );
    }

    const contentType = backendRes.headers.get("Content-Type") || "audio/webm";
    const contentLength = backendRes.headers.get("Content-Length");

    console.log(`[Download API] ${videoId}: Content-Length=${contentLength}, type=${contentType}`);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Expose-Headers": "Content-Length, Content-Type",
    };

    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    // Stream straight through — no buffering in this serverless function.
    // The Python side sends Content-Length so the browser can track progress.
    return new NextResponse(backendRes.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[Download API] Error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
