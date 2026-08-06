import { NextRequest, NextResponse } from "next/server";

const AUDIO_BACKEND_URL = process.env.AUDIO_BACKEND_URL || process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL || "http://localhost:8000";

// Increase timeout for this route
export const maxDuration = 300; // 5 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  const headers: HeadersInit = {
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  // Forward Range header for seeking support
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  try {
    console.log(`[Audio API] Fetching from ${AUDIO_BACKEND_URL}/audio/${videoId}`);
    
    const response = await fetch(`${AUDIO_BACKEND_URL}/audio/${videoId}`, {
      headers,
    });

    console.log(`[Audio API] Backend response: ${response.status}, Content-Length: ${response.headers.get("Content-Length")}`);

    if (!response.ok && response.status !== 206) {
      console.error(`[Audio API] Backend error: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to fetch audio" },
        { status: response.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", response.headers.get("Content-Type") || "audio/webm");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "private, max-age=3600");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Type");
    
    if (response.headers.get("Content-Length")) {
      responseHeaders.set("Content-Length", response.headers.get("Content-Length")!);
    }
    if (response.headers.get("Content-Range")) {
      responseHeaders.set("Content-Range", response.headers.get("Content-Range")!);
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Audio API] Proxy error:", error);
    return NextResponse.json(
      { error: "Audio proxy failed" },
      { status: 502 }
    );
  }
}
