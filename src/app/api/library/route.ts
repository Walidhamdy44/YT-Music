import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request });

    if (!token?.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated. Sign out and sign back in to grant YouTube access.", playlists: [], likedSongs: [], nextPageToken: undefined },
        { status: 401 }
      );
    }

    const accessToken = token.accessToken as string;
    const pageToken = request.nextUrl.searchParams.get("pageToken") || undefined;

    // Fetch liked songs — one page at a time (50 per page)
    let likedSongs: Array<{
      id: string;
      videoId: string;
      title: string;
      artist: string;
      thumbnail: string;
      duration: number;
    }> = [];
    let likedNextPageToken: string | undefined;

    try {
      const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=LM&maxResults=50${pageParam}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        likedNextPageToken = data.nextPageToken || undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (data.items || []).filter((item: any) =>
          item.snippet?.resourceId?.videoId && item.snippet.title !== "Deleted video" && item.snippet.title !== "Private video"
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        likedSongs = items.map((item: any) => ({
          id: item.snippet.resourceId.videoId,
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title || "Unknown",
          artist: (item.snippet.videoOwnerChannelTitle || "").replace(" - Topic", ""),
          thumbnail:
            item.snippet.thumbnails?.medium?.url ||
            item.snippet.thumbnails?.default?.url ||
            "",
          duration: 0,
        }));
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Liked songs fetch failed:", res.status, err);
      }
    } catch (err) {
      console.error("Error fetching liked songs:", err);
    }

    // Fetch user's playlists (only on first page — playlists don't need pagination typically)
    const playlists: Array<{
      id: string;
      title: string;
      description: string;
      thumbnail: string;
      trackCount: number;
    }> = [];

    if (!pageToken) {
      try {
        let playlistPageToken = "";

        while (true) {
          const res = await fetch(
            `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50${playlistPageToken ? `&pageToken=${playlistPageToken}` : ""}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (!res.ok) break;

          const data = await res.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          playlists.push(...(data.items || []).map((item: any) => ({
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description || "",
            thumbnail:
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              "",
            trackCount: item.contentDetails?.itemCount || 0,
          })));

          playlistPageToken = data.nextPageToken || "";
          if (!playlistPageToken) break;
        }
      } catch (err) {
        console.error("Error fetching playlists:", err);
      }
    }

    return NextResponse.json({
      playlists,
      likedSongs,
      nextPageToken: likedNextPageToken,
    });
  } catch (error) {
    console.error("Library API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch library", playlists: [], likedSongs: [], nextPageToken: undefined },
      { status: 500 }
    );
  }
}
