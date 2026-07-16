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

export async function GET(request: NextRequest) {
  const sections: Array<{
    title: string;
    type: string;
    items: Array<{
      id: string;
      videoId: string;
      title: string;
      artist: string;
      duration: number;
      thumbnail: string;
      views?: string;
    }>;
  }> = [];

  // Try to get personalized data from YouTube API if user is authenticated
  const token = await getToken({ req: request });
  const accessToken = token?.accessToken as string | undefined;

  if (accessToken) {
    // "Listen Again" — user's recently played / liked videos
    try {
      // Fetch liked music (acts as "Listen Again" since these are songs you've engaged with)
      const likedRes = await fetch(
        "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LM&maxResults=15",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (likedRes.ok) {
        const data = await likedRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (data.items || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((item: any) => item.snippet?.resourceId?.videoId && item.snippet.title !== "Deleted video" && item.snippet.title !== "Private video")
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

        if (items.length > 0) {
          sections.push({
            title: "Listen again",
            type: "listen_again",
            items,
          });
        }
      }
    } catch (err) {
      console.error("Listen again fetch failed:", err);
    }

    // Quick Picks — use YouTube's activity/recommendations
    try {
      // Get user's playlists to find "My Mix" or similar auto-generated playlists
      const playlistsRes = await fetch(
        "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=10",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (playlistsRes.ok) {
        const data = await playlistsRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const musicPlaylists = (data.items || []).filter((p: any) =>
          p.snippet.title.toLowerCase().includes("mix") ||
          p.contentDetails.itemCount > 5
        );

        // Get tracks from the first music playlist for "Quick picks"
        if (musicPlaylists.length > 0) {
          const plRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${musicPlaylists[0].id}&maxResults=15`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (plRes.ok) {
            const plData = await plRes.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = (plData.items || [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((item: any) => item.snippet?.resourceId?.videoId)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((item: any) => ({
                id: item.snippet.resourceId.videoId,
                videoId: item.snippet.resourceId.videoId,
                title: item.snippet.title || "Unknown",
                artist: (item.snippet.videoOwnerChannelTitle || "").replace(" - Topic", ""),
                duration: 0,
                thumbnail: item.snippet.thumbnails?.medium?.url || "",
              }))
              .filter((t: { videoId: string }) => isValidVideoId(t.videoId));

            if (items.length > 0) {
              sections.push({ title: "From your playlists", type: "tracks", items });
            }
          }
        }
      }
    } catch (err) {
      console.error("Quick picks fetch failed:", err);
    }

    // "Forgotten favorites" — older liked songs (page 2 of liked music)
    try {
      // First get page 1 to get the nextPageToken
      const page1Res = await fetch(
        "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LM&maxResults=50",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (page1Res.ok) {
        const page1Data = await page1Res.json();
        const nextPageToken = page1Data.nextPageToken;

        if (nextPageToken) {
          // Fetch page 2+ (older songs = forgotten favorites)
          const page2Res = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LM&maxResults=15&pageToken=${nextPageToken}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (page2Res.ok) {
            const page2Data = await page2Res.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = (page2Data.items || [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((item: any) => item.snippet?.resourceId?.videoId && item.snippet.title !== "Deleted video" && item.snippet.title !== "Private video")
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

            if (items.length > 0) {
              sections.push({
                title: "Forgotten favorites",
                type: "forgotten_favorites",
                items,
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Forgotten favorites fetch failed:", err);
    }

    // "Albums for you" — get liked videos grouped by album/channel
    try {
      const likedForAlbums = await fetch(
        "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=LM&maxResults=50",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (likedForAlbums.ok) {
        const data = await likedForAlbums.json();
        // Group by channel (artist) to simulate album recommendations
        const artistMap = new Map<string, { artist: string; thumbnail: string; tracks: number }>();
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data.items || []).forEach((item: any) => {
          const artist = (item.snippet.videoOwnerChannelTitle || "").replace(" - Topic", "");
          const thumbnail = item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || "";
          if (artist && artist !== "Unknown") {
            const existing = artistMap.get(artist);
            if (existing) {
              existing.tracks++;
            } else {
              artistMap.set(artist, { artist, thumbnail, tracks: 1 });
            }
          }
        });

        // Get artists with 2+ tracks (you listen to them a lot = album recommendation)
        const topArtists = Array.from(artistMap.values())
          .filter(a => a.tracks >= 2)
          .sort((a, b) => b.tracks - a.tracks)
          .slice(0, 10);

        if (topArtists.length > 0) {
          // Search for albums by these artists
          const yt = await getInnertube();
          const albumItems: typeof sections[0]["items"] = [];

          for (const artistInfo of topArtists.slice(0, 5)) {
            try {
              const albumResults = await yt.music.search(artistInfo.artist, { type: "album" });
              const contents = albumResults?.contents || [];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const shelf = contents.find((c: any) => c.type === "MusicShelf");
              if (shelf?.contents?.[0]) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const album = shelf.contents[0] as any;
                let thumbnail = "";
                if (album.thumbnail?.contents) {
                  thumbnail = album.thumbnail.contents[album.thumbnail.contents.length - 1]?.url || "";
                }
                albumItems.push({
                  id: album.id || "",
                  videoId: album.id || "",
                  title: album.title || "Unknown Album",
                  artist: artistInfo.artist,
                  duration: 0,
                  thumbnail,
                });
              }
            } catch {
              // Skip failed album searches
            }
          }

          if (albumItems.length > 0) {
            sections.push({
              title: "Albums for you",
              type: "albums_for_you",
              items: albumItems,
            });
          }
        }
      }
    } catch (err) {
      console.error("Albums for you fetch failed:", err);
    }
  }

  // Always add "Quick Picks" from YT Music search (personalized by region)
  try {
    const yt = await getInnertube();

    // Rotate queries so each visit feels fresh (like real YT Music)
    const allAuthQueries = [
      "arabic music 2025", "trending egypt music", "egyptian pop",
      "arabic hits", "khaleeji music", "mahraganat 2025",
      "arabic rap", "tamer hosny", "amr diab", "sherine",
      "arabic chill", "arabic workout", "new arabic releases",
    ];
    const allGenericQueries = [
      "top hits 2025", "popular music", "trending songs",
      "chill vibes", "workout mix", "party hits",
      "new releases this week", "feel good music", "electronic music",
    ];

    // Pick 2 random queries each time
    const queryPool = accessToken ? allAuthQueries : allGenericQueries;
    const shuffled = queryPool.sort(() => Math.random() - 0.5);
    const quickPickQueries = shuffled.slice(0, 2);

    for (const query of quickPickQueries) {
      const results = await yt.music.search(query, { type: "song" });
      const contents = results?.contents || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shelf = contents.find((c: any) => c.type === "MusicShelf");
      if (shelf?.contents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = shelf.contents.slice(0, 12).map((item: any) => {
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
            duration: item.duration?.seconds || 0,
            thumbnail,
          };
        }).filter((t: { videoId: string }) => isValidVideoId(t.videoId));

        if (items.length > 0) {
          sections.push({
            title: sections.length === 0 || (sections.length === 1 && sections[0].type === "listen_again")
              ? "Quick picks"
              : query.charAt(0).toUpperCase() + query.slice(1),
            type: "tracks",
            items,
          });
        }
        // Only need one quick picks section if we already have listen again
        if (sections.some(s => s.type === "listen_again")) break;
      }
    }
  } catch (err) {
    console.error("Quick picks search failed:", err);
  }

  return NextResponse.json({ sections });
}
