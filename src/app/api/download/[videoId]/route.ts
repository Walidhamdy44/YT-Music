import { NextRequest, NextResponse } from "next/server";

const AUDIO_BACKEND_URL =
  process.env.AUDIO_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL ||
  "http://localhost:8000";

/**
 * Download endpoint — fetches the full audio from the Python backend's
 * /download route (which buffers on the Python side), then re-sends it as a
 * single buffered response from Next.js.
 *
 * WHY: Vercel strips Content-Length on streaming responses.
 *      Without Content-Length the browser cannot track download progress —
 *      the ReadableStream reader never gets a total byte count and the UI
 *      stays stuck at ~50%.  Buffering here ensures the header is present.
 *
 * TRADE-OFF: The full file (~3-5 MB) is held in memory on the serverless
 *            function.  On Vercel's free plan the limit is 50 MB — fine for
 *            audio files.  The function must complete within Vercel's timeout;
 *            the Python /download endpoint fetches from YouTube first so the
 *            cold-path time is dominated by YouTube CDN speed (~2-8 s).
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
    // Use the Python /download endpoint — it already buffers the full file
    // and returns it with Content-Length set.
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

    // Buffer the entire response body in this serverless function so we can
    // report an exact Content-Length to the browser.
    const buffer = await backendRes.arrayBuffer();
    const contentType = backendRes.headers.get("Content-Type") || "audio/webm";

    console.log(`[Download API] ${videoId}: ${buffer.byteLength} bytes, type: ${contentType}`);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),   // guaranteed exact — enables progress tracking
        "Cache-Control": "private, max-age=3600",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type",
      },
    });
  } catch (err) {
    console.error("[Download API] Error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
