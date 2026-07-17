import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * POST /api/rate
 * Rates a video on YouTube (like/dislike/none).
 * This syncs directly with the user's YouTube Music account.
 *
 * Body: { videoId: string, rating: "like" | "dislike" | "none" }
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    const accessToken = token?.accessToken as string | undefined;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { videoId, rating } = await request.json();

    if (!videoId || !["like", "dislike", "none"].includes(rating)) {
      return NextResponse.json(
        { error: "videoId and rating (like/dislike/none) required" },
        { status: 400 }
      );
    }

    // YouTube Data API v3 — videos.rate
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos/rate?id=${videoId}&rating=${rating}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Rate API error:", res.status, err);
      return NextResponse.json(
        { error: "Failed to rate video", status: res.status },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, videoId, rating });
  } catch (error) {
    console.error("Rate error:", error);
    return NextResponse.json(
      { error: "Failed to rate" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rate?videoId=xxx
 * Gets the user's rating for a video.
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    const accessToken = token?.accessToken as string | undefined;

    if (!accessToken) {
      return NextResponse.json({ rating: "none" });
    }

    const videoId = request.nextUrl.searchParams.get("videoId");
    if (!videoId) {
      return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }

    // YouTube Data API v3 — videos.getRating
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos/getRating?id=${videoId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const item = data.items?.[0];
      return NextResponse.json({ rating: item?.rating || "none" });
    }

    return NextResponse.json({ rating: "none" });
  } catch {
    return NextResponse.json({ rating: "none" });
  }
}
