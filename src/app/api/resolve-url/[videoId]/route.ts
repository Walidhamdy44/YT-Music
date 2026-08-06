import { NextRequest, NextResponse } from "next/server";

const AUDIO_BACKEND_URL =
  process.env.AUDIO_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL ||
  "http://localhost:8000";

/**
 * Resolve the direct YouTube CDN URL for a video without streaming any audio.
 * The URL is valid for ~6 hours (set by YouTube).
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
    const res = await fetch(`${AUDIO_BACKEND_URL}/resolve-url/${videoId}`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to resolve URL" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[resolve-url] Error:", err);
    return NextResponse.json({ error: "Resolve failed" }, { status: 502 });
  }
}
