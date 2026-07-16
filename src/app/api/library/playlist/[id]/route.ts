import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pageToken = request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessToken = (session as any).accessToken as string;
    if (!accessToken) {
      return NextResponse.json({ error: "No access token" }, { status: 401 });
    }

    // Fetch playlist details (only on first page)
    let playlistInfo = { title: "", description: "", thumbnail: "", trackCount: 0 };
    if (!pageToken) {
      const playlistRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (playlistRes.ok) {
        const data = await playlistRes.json();
        const item = data.items?.[0];
        if (item) {
          playlistInfo = {
            title: item.snippet.title,
            description: item.snippet.description || "",
            thumbnail: item.snippet.thumbnails?.medium?.url || "",
            trackCount: item.contentDetails?.itemCount || 0,
          };
        }
      }
    }

    // Fetch one page of playlist items
    const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
    const itemsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${id}&maxResults=50${pageParam}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let tracks: Array<{
      id: string;
      videoId: string;
      title: string;
      artist: string;
      thumbnail: string;
      duration: number;
    }> = [];
    let nextPageToken: string | undefined;

    if (itemsRes.ok) {
      const data = await itemsRes.json();
      nextPageToken = data.nextPageToken || undefined;

      if (!pageToken) {
        playlistInfo.trackCount = playlistInfo.trackCount || data.pageInfo?.totalResults || 0;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tracks = (data.items || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((item: any) => item.snippet?.resourceId?.videoId && item.snippet.title !== "Deleted video" && item.snippet.title !== "Private video")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => ({
          id: item.snippet.resourceId.videoId,
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title || "Unknown",
          artist: item.snippet.videoOwnerChannelTitle?.replace(" - Topic", "") || "",
          thumbnail:
            item.snippet.thumbnails?.medium?.url ||
            item.snippet.thumbnails?.default?.url ||
            "",
          duration: 0,
        }));
    }

    return NextResponse.json({ ...playlistInfo, tracks, nextPageToken });
  } catch (error) {
    console.error("Playlist fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
  }
}
