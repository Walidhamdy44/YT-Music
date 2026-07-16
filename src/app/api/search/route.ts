import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

let innertube: Innertube | null = null;

async function getInnertube() {
  if (!innertube) {
    innertube = await Innertube.create({
      lang: "en",
      location: "EG",
    });
  }
  return innertube;
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q");

    if (!q) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const yt = await getInnertube();

    // Search for songs specifically
    const songResults = await yt.music.search(q, { type: "song" });
    const albumResults = await yt.music.search(q, { type: "album" });
    const artistResults = await yt.music.search(q, { type: "artist" });

    // Parse songs from MusicShelf structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks = extractFromShelf(songResults).map((item: any) => ({
      id: item.id || "",
      videoId: item.id || "",
      title: item.title || "Unknown",
      artist: item.artists?.map((a: { name: string }) => a.name).join(", ") || "Unknown",
      artistId: item.artists?.[0]?.channel_id || "",
      album: item.album?.name || "",
      albumId: item.album?.id || "",
      duration: item.duration?.seconds || 0,
      thumbnail: getThumbnailUrl(item.thumbnail),
    }));

    // Parse albums
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const albums = extractFromShelf(albumResults).map((item: any) => ({
      id: item.id || "",
      title: item.title || "Unknown",
      artist: item.artists?.map((a: { name: string }) => a.name).join(", ") ||
              item.author?.name || "Unknown",
      artistId: item.artists?.[0]?.channel_id || "",
      thumbnail: getThumbnailUrl(item.thumbnail),
      year: item.year ? parseInt(String(item.year)) : undefined,
      type: "album" as const,
    }));

    // Parse artists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const artists = extractFromShelf(artistResults).map((item: any) => ({
      id: item.id || "",
      name: item.name || item.title || "Unknown",
      thumbnail: getThumbnailUrl(item.thumbnail),
      subscribers: item.subscribers?.text || item.subtitle?.text || "",
    }));

    return NextResponse.json({
      tracks: tracks.filter((t: { videoId: string }) => /^[a-zA-Z0-9_-]{11}$/.test(t.videoId)).slice(0, 20),
      albums: albums.slice(0, 10),
      artists: artists.slice(0, 10),
      playlists: [],
    });
  } catch (error) {
    console.error("Search error:", error);
    innertube = null;
    return NextResponse.json(
      {
        error: "Search failed",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 }
    );
  }
}

// Extract items from the youtubei.js v17 search response structure
// Results come as either MusicShelf or ItemSection arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromShelf(results: any): any[] {
  const contents = results?.contents;
  if (!contents || !Array.isArray(contents)) return [];

  // Type: 'song' returns MusicShelf with contents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shelf = contents.find((c: any) => c.type === "MusicShelf");
  if (shelf?.contents) return shelf.contents;

  // If it's ItemSection array, flatten them
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = contents.filter((c: any) => c.type === "ItemSection");
  if (items.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.flatMap((section: any) => section.contents || []);
  }

  return [];
}

// Extract thumbnail URL from the youtubei.js thumbnail object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getThumbnailUrl(thumbnail: any): string {
  if (!thumbnail) return "";

  // MusicThumbnail type has .contents array
  if (thumbnail.contents && Array.isArray(thumbnail.contents)) {
    // Get the larger thumbnail
    const sorted = [...thumbnail.contents].sort(
      (a: { width?: number }, b: { width?: number }) =>
        (b.width || 0) - (a.width || 0)
    );
    return sorted[0]?.url || "";
  }

  // Direct array of thumbnails
  if (Array.isArray(thumbnail)) {
    const sorted = [...thumbnail].sort(
      (a: { width?: number }, b: { width?: number }) =>
        (b.width || 0) - (a.width || 0)
    );
    return sorted[0]?.url || "";
  }

  // Single thumbnail object
  if (thumbnail.url) return thumbnail.url;

  return "";
}
