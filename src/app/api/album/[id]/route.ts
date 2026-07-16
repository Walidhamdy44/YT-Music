import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

let innertube: Innertube | null = null;

async function getInnertube() {
  if (!innertube) {
    innertube = await Innertube.create({ lang: "en", location: "EG" });
  }
  return innertube;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const yt = await getInnertube();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const album = await (yt.music as any).getAlbum(id);

    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // Extract album info
    const title = album.header?.title?.text || album.title || "Unknown Album";
    const artist =
      album.header?.subtitle?.text ||
      album.header?.strapline_text_one?.text ||
      "";
    const year = album.header?.subtitle?.text?.match(/\d{4}/)?.[0] || "";
    const description = album.header?.description?.text || "";
    const trackCount = album.header?.song_count?.text || "";

    // Get thumbnail
    let thumbnail = "";
    const thumbData =
      album.header?.thumbnail?.contents ||
      album.header?.thumbnail?.music_thumbnail_renderer?.thumbnail?.thumbnails;
    if (thumbData && Array.isArray(thumbData)) {
      thumbnail = thumbData[thumbData.length - 1]?.url || thumbData[0]?.url || "";
    }
    if (!thumbnail && album.header?.thumbnails) {
      const thumbs = album.header.thumbnails;
      thumbnail = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "";
    }

    // Extract tracks from the album
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks: any[] = [];
    const contents = album.contents || album.section_list?.contents || [];

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
              artist.split("•")[0]?.trim() ||
              "",
            duration: item.duration?.seconds || 0,
            thumbnail: trackThumbnail || thumbnail,
          });
        }
        // Recurse into shelves
        if (item.contents) {
          extractTracks(item.contents);
        }
      }
    }

    if (Array.isArray(contents)) {
      extractTracks(contents);
    }

    return NextResponse.json({
      id,
      title,
      artist: artist.split("•")[0]?.trim() || "",
      year: year ? parseInt(year) : undefined,
      description,
      thumbnail,
      trackCount: tracks.length || trackCount,
      tracks: tracks.filter((t) => t.videoId && /^[a-zA-Z0-9_-]{11}$/.test(t.videoId)),
    });
  } catch (error) {
    console.error("Album fetch error:", error);
    innertube = null;
    return NextResponse.json(
      { error: "Failed to fetch album", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
