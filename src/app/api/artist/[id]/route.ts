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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Artist ID required" }, { status: 400 });
    }

    const yt = await getInnertube();
    const artist = await yt.music.getArtist(id);

    // Extract header info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const header = artist.header as any;
    const name = header?.title?.text || header?.name || "Unknown Artist";
    const thumbnail = getThumbnailUrl(header?.thumbnail);
    const thumbnailLarge = getLargeThumbnailUrl(header?.thumbnail);
    const subscribers = header?.subscribers?.text || header?.subtitle?.text || "";
    const description = header?.description?.text || "";

    // Extract songs section
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections = artist.sections || [];
    let topSongs: any[] = [];
    let albums: any[] = [];
    let singles: any[] = [];

    for (const section of sections) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sec = section as any;
      const title = sec.header?.title?.text?.toLowerCase() || sec.title?.text?.toLowerCase() || "";
      
      if (title.includes("song") || title.includes("top")) {
        topSongs = sec.contents || [];
      } else if (title.includes("album")) {
        albums = sec.contents || [];
      } else if (title.includes("single")) {
        singles = sec.contents || [];
      }
    }

    // Parse top songs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks = topSongs.map((item: any) => ({
      id: item.id || item.video_id || "",
      videoId: item.id || item.video_id || "",
      title: item.title?.text || item.title || "Unknown",
      artist: item.artists?.map((a: { name: string }) => a.name).join(", ") || name,
      artistId: id,
      album: item.album?.name || "",
      albumId: item.album?.id || "",
      duration: item.duration?.seconds || 0,
      thumbnail: getThumbnailUrl(item.thumbnail),
    })).filter((t: { videoId: string }) => t.videoId);

    // Parse albums
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsedAlbums = albums.map((item: any) => ({
      id: item.id || "",
      title: item.title?.text || item.title || "Unknown",
      artist: name,
      artistId: id,
      thumbnail: getThumbnailUrl(item.thumbnail),
      year: item.year?.text ? parseInt(item.year.text) : undefined,
      type: "album" as const,
    })).filter((a: { id: string }) => a.id);

    // Parse singles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsedSingles = singles.map((item: any) => ({
      id: item.id || "",
      title: item.title?.text || item.title || "Unknown",
      artist: name,
      artistId: id,
      thumbnail: getThumbnailUrl(item.thumbnail),
      year: item.year?.text ? parseInt(item.year.text) : undefined,
      type: "single" as const,
    })).filter((a: { id: string }) => a.id);

    return NextResponse.json({
      id,
      name,
      thumbnail,
      thumbnailLarge,
      subscribers,
      description,
      tracks: tracks.slice(0, 20),
      albums: parsedAlbums.slice(0, 10),
      singles: parsedSingles.slice(0, 10),
    });
  } catch (error) {
    console.error("Artist fetch error:", error);
    innertube = null;
    return NextResponse.json(
      { error: "Failed to fetch artist", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getThumbnailUrl(thumbnail: any): string {
  if (!thumbnail) return "";
  if (thumbnail.contents && Array.isArray(thumbnail.contents)) {
    const sorted = [...thumbnail.contents].sort(
      (a: { width?: number }, b: { width?: number }) => (b.width || 0) - (a.width || 0)
    );
    return sorted[0]?.url || "";
  }
  if (Array.isArray(thumbnail)) {
    const sorted = [...thumbnail].sort(
      (a: { width?: number }, b: { width?: number }) => (b.width || 0) - (a.width || 0)
    );
    return sorted[0]?.url || "";
  }
  if (thumbnail.url) return thumbnail.url;
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLargeThumbnailUrl(thumbnail: any): string {
  if (!thumbnail) return "";
  if (thumbnail.contents && Array.isArray(thumbnail.contents)) {
    // Get the largest one
    const sorted = [...thumbnail.contents].sort(
      (a: { width?: number }, b: { width?: number }) => (b.width || 0) - (a.width || 0)
    );
    return sorted[0]?.url || "";
  }
  return getThumbnailUrl(thumbnail);
}
