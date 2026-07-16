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

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");

  if (!videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: "Valid videoId required" }, { status: 400 });
  }

  try {
    const yt = await getInnertube();

    // Get the "Up Next" / watch next recommendations for this song
    // This is what YT Music uses to build the radio queue
    const info = await yt.music.getInfo(videoId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const related = (info as any).related?.content?.contents || 
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (info as any).watch_next?.content?.contents ||
                    [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tracks = related.filter((item: any) => {
      const id = item.id || item.video_id || "";
      return isValidVideoId(id) && id !== videoId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).map((item: any) => {
      let thumbnail = "";
      if (item.thumbnail?.contents) {
        thumbnail = item.thumbnail.contents[0]?.url || "";
      } else if (Array.isArray(item.thumbnail)) {
        thumbnail = item.thumbnail[0]?.url || "";
      }

      return {
        id: item.id || item.video_id || "",
        videoId: item.id || item.video_id || "",
        title: item.title?.text || item.title || "Unknown",
        artist: item.artists?.map((a: { name: string }) => a.name).join(", ") ||
                item.authors?.[0]?.name || item.subtitle?.text || "Unknown",
        duration: item.duration?.seconds || 0,
        thumbnail,
      };
    });

    // If we couldn't get related from the info, search for similar songs
    if (tracks.length < 5) {
      // Get the current song's artist to find similar
      const songInfo = await yt.music.getInfo(videoId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const artistName = (songInfo as any).basic_info?.author || 
                         // eslint-disable-next-line @typescript-eslint/no-explicit-any
                         (songInfo as any).basic_info?.channel?.name || "";

      if (artistName) {
        // Search for more songs by same artist + similar
        const results = await yt.music.search(artistName, { type: "song" });
        const contents = results?.contents || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shelf = contents.find((c: any) => c.type === "MusicShelf");
        if (shelf?.contents) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const searchTracks = shelf.contents.slice(0, 20).map((item: any) => {
            let thumbnail = "";
            if (item.thumbnail?.contents) {
              thumbnail = item.thumbnail.contents[0]?.url || "";
            }
            return {
              id: item.id || "",
              videoId: item.id || "",
              title: item.title || "Unknown",
              artist: item.artists?.map((a: { name: string }) => a.name).join(", ") || "Unknown",
              duration: item.duration?.seconds || 0,
              thumbnail,
            };
          }).filter((t: { videoId: string }) => isValidVideoId(t.videoId) && t.videoId !== videoId);

          tracks = [...tracks, ...searchTracks];
        }
      }
    }

    // Deduplicate by videoId
    const seen = new Set<string>();
    tracks = tracks.filter((t: { videoId: string }) => {
      if (seen.has(t.videoId)) return false;
      seen.add(t.videoId);
      return true;
    });

    return NextResponse.json({ tracks: tracks.slice(0, 25) });
  } catch (error) {
    console.error("Radio error:", error);
    innertube = null;
    return NextResponse.json({ tracks: [] });
  }
}
