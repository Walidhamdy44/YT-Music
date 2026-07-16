import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Innertube } from "youtubei.js";

let innertube: Innertube | null = null;

async function getInnertube() {
  if (!innertube) {
    innertube = await Innertube.create({ lang: "en", location: "EG" });
  }
  return innertube;
}

function isValidVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/**
 * Fetch one page of playlist items using the YouTube Data API v3
 */
async function fetchPageWithDataAPI(
  id: string,
  accessToken: string,
  pageToken?: string
) {
  // Fetch playlist details (only on first page)
  let title = "";
  let description = "";
  let thumbnail = "";
  let author = "";
  let totalCount = 0;

  if (!pageToken) {
    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (playlistRes.ok) {
      const data = await playlistRes.json();
      const item = data.items?.[0];
      if (item) {
        title = item.snippet?.title || "";
        description = item.snippet?.description || "";
        author = item.snippet?.channelTitle || "";
        totalCount = item.contentDetails?.itemCount || 0;
        thumbnail =
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "";
      }
    }
  }

  // Fetch one page of playlist items
  const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
  const itemsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${id}&maxResults=50${pageParam}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tracks: any[] = [];
  let nextPageToken: string | undefined;

  if (itemsRes.ok) {
    const itemsData = await itemsRes.json();
    nextPageToken = itemsData.nextPageToken || undefined;
    totalCount = totalCount || itemsData.pageInfo?.totalResults || 0;

    tracks = (itemsData.items || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((item: any) =>
        item.snippet?.resourceId?.videoId &&
        item.snippet.title !== "Deleted video" &&
        item.snippet.title !== "Private video"
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ({
        id: item.snippet.resourceId.videoId,
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title || "Unknown",
        artist: (item.snippet.videoOwnerChannelTitle || "").replace(" - Topic", ""),
        duration: 0,
        thumbnail:
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
      }))
      .filter((t: { videoId: string }) => isValidVideoId(t.videoId));
  }

  return {
    id,
    title,
    description,
    author,
    thumbnail: thumbnail || (tracks[0]?.thumbnail || ""),
    trackCount: totalCount,
    tracks,
    nextPageToken,
  };
}

/**
 * Fetch playlist using youtubei.js (for public playlists — returns all tracks)
 */
async function fetchWithInnertube(id: string) {
  const yt = await getInnertube();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playlist = await (yt.music as any).getPlaylist(id);

  if (!playlist) return null;

  const title =
    playlist.header?.title?.text ||
    playlist.header?.title ||
    playlist.title ||
    "Unknown Playlist";
  const description =
    playlist.header?.description?.text ||
    playlist.header?.subtitle?.text ||
    playlist.description ||
    "";
  const author =
    playlist.header?.author?.name ||
    playlist.header?.strapline_text_one?.text ||
    "";

  let thumbnail = "";
  const thumbData =
    playlist.header?.thumbnail?.contents ||
    playlist.header?.thumbnail?.music_thumbnail_renderer?.thumbnail?.thumbnails;
  if (thumbData && Array.isArray(thumbData)) {
    thumbnail = thumbData[thumbData.length - 1]?.url || thumbData[0]?.url || "";
  }
  if (!thumbnail && playlist.header?.thumbnails) {
    const thumbs = playlist.header.thumbnails;
    thumbnail = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracks: any[] = [];
  const contents = playlist.contents || playlist.section_list?.contents || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractTracks(items: any[]) {
    for (const item of items) {
      if (item.type === "MusicResponsiveListItem" || item.id) {
        let trackThumbnail = "";
        if (item.thumbnail?.contents) {
          trackThumbnail =
            item.thumbnail.contents[item.thumbnail.contents.length - 1]?.url || "";
        }
        tracks.push({
          id: item.id || "",
          videoId: item.id || "",
          title: item.title || item.name || "Unknown",
          artist:
            item.artists?.map((a: { name: string }) => a.name).join(", ") ||
            item.author?.name ||
            "",
          duration: item.duration?.seconds || 0,
          thumbnail: trackThumbnail || thumbnail,
        });
      }
      if (item.contents) {
        extractTracks(item.contents);
      }
    }
  }

  if (Array.isArray(contents)) {
    extractTracks(contents);
  }

  return {
    id,
    title,
    description,
    author,
    thumbnail,
    trackCount: tracks.length,
    tracks: tracks.filter((t) => t.videoId && isValidVideoId(t.videoId)),
    nextPageToken: undefined as string | undefined,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pageToken = request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    // For personalized playlists (RDTMAK, LM, etc.), use the YouTube Data API with auth
    const isPersonalized =
      id.startsWith("RDTMAK") ||
      id.startsWith("RDEM") ||
      id === "LM" ||
      id === "LL" ||
      id === "SE";

    if (isPersonalized) {
      const token = await getToken({ req: request });
      const accessToken = token?.accessToken as string | undefined;

      if (accessToken) {
        const result = await fetchPageWithDataAPI(id, accessToken, pageToken);
        return NextResponse.json(result);
      }
    }

    // For public playlists, use youtubei.js (no pagination support here)
    const result = await fetchWithInnertube(id);
    if (!result) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("YT Playlist fetch error:", error);
    innertube = null;
    return NextResponse.json(
      { error: "Failed to fetch playlist", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
