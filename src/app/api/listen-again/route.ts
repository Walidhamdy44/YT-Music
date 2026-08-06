import { NextRequest, NextResponse } from "next/server";

const AUDIO_BACKEND_URL =
  process.env.AUDIO_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL ||
  "http://localhost:8000";

/**
 * Proxy to the Python backend's /listen-again endpoint.
 * The Python backend uses ytmusicapi with cookie auth to call
 * FEmusic_listen_again and returns the real personalised track list.
 */
export async function GET(_request: NextRequest) {
  try {
    const res = await fetch(`${AUDIO_BACKEND_URL}/listen-again`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      // 10 second timeout — ytmusicapi may be slow on first call
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[listen-again] Backend error: ${res.status}`);
      return NextResponse.json({ tracks: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[listen-again] Error:", err);
    return NextResponse.json({ tracks: [] });
  }
}
