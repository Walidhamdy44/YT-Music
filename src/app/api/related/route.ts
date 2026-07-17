import { NextRequest, NextResponse } from "next/server";
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
 * GET /api/related?videoId=xxx
 *
 * Returns "You might also like" recommendations for a given track.
 * This is different from the radio queue (/api/radio) — it shows
 * discovery-focused recommendations (similar artists, albums, etc.)
 */
export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");

  if (!videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: "Valid videoId required" }, { status: 400 });
  }

  try {
    const yt = await getInnertube();

    // Use getRelated which fetches the "You might also like" section
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let relatedItems: any[] = [];

    try {
      const info = await yt.music.getInfo(videoId);
      // The related tab in YT Music comes from the "related" endpoint
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relatedData = await (info as any).getRelated?.();
      if (relatedData?.contents) {
        relatedItems = relatedData.contents;
      }
    } catch {
      // getRelated might not be available, fall through to fallback
    }

    // If getRelated didn't work, try fetching from the watch_next related section
    if (relatedItems.length === 0) {
      try {
        const info = await yt.music.getInfo(videoId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sections = (info as any).related?.sections || 
                         // eslint-disable-next-line @typescript-eslint/no-explicit-any
                         (info as any).related?.content?.contents || [];
        
        // Flatten sections — each section might have a "contents" array
        for (const section of sections) {
          if (section.contents) {
            relatedItems.push(...section.contents);
          } else if (section.id || section.video_id) {
            relatedItems.push(section);
          }
        }
      } catch {
        // Fall through to search fallback
      }
    }

    // Parse related items into tracks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tracks = relatedItems.filter((item: any) => {
      const id = item.id || item.video_id || "";
      return isValidVideoId(id) && id !== videoId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).map((item: any) => {
      let thumbnail = "";
      if (item.thumbnail?.contents) {
        const thumbs = item.thumbnail.contents;
        thumbnail = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "";
      } else if (Array.isArray(item.thumbnail)) {
        thumbnail = item.thumbnail[item.thumbnail.length - 1]?.url || item.thumbnail[0]?.url || "";
      }

      return {
        id: item.id || item.video_id || "",
        videoId: item.id || item.video_id || "",
        title: item.title?.text || item.title || "Unknown",
        artist: item.artists?.map((a: { name: string }) => a.name).join(", ") ||
                item.authors?.[0]?.name || 
                item.subtitle?.text || 
                item.album?.name || "Unknown",
        album: item.album?.name || "",
        duration: item.duration?.seconds || 0,
        thumbnail,
      };
    });

    // Fallback: if no related found, search for similar music
    if (tracks.length < 5) {
      try {
        const info = await yt.music.getInfo(videoId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const artistName = (info as any).basic_info?.author || "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const title = (info as any).basic_info?.title || "";

        // Search by song title (gets "you might also like" style results)
        const query = title ? `${title} ${artistName}`.trim() : artistName;
        if (query) {
          const results = await yt.music.search(query, { type: "song" });
          const contents = results?.contents || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const shelf = contents.find((c: any) => c.type === "MusicShelf");
          if (shelf?.contents) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const searchTracks = shelf.contents.slice(0, 20).map((item: any) => {
              let thumbnail = "";
              if (item.thumbnail?.contents) {
                const thumbs = item.thumbnail.contents;
                thumbnail = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "";
              }
              return {
                id: item.id || "",
                videoId: item.id || "",
                title: item.title || "Unknown",
                artist: item.artists?.map((a: { name: string }) => a.name).join(", ") || "Unknown",
                album: item.album?.name || "",
                duration: item.duration?.seconds || 0,
                thumbnail,
              };
            }).filter((t: { videoId: string }) => isValidVideoId(t.videoId) && t.videoId !== videoId);

            // Add only tracks not already in the list
            const existingIds = new Set(tracks.map(t => t.videoId));
            const newTracks = searchTracks.filter((t: { videoId: string }) => !existingIds.has(t.videoId));
            tracks = [...tracks, ...newTracks];
          }
        }
      } catch {
        // Search fallback failed, that's fine
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    tracks = tracks.filter((t: { videoId: string }) => {
      if (seen.has(t.videoId)) return false;
      seen.add(t.videoId);
      return true;
    });

    return NextResponse.json({ tracks: tracks.slice(0, 25) });
  } catch (error) {
    console.error("Related error:", error);
    innertube = null;
    return NextResponse.json({ tracks: [] });
  }
}
