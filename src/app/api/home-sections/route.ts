import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export interface HomeSectionItem {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  playlistId: string;
  type: "playlist";
}

export interface HomeSection {
  title: string;
  items: HomeSectionItem[];
}

// Known auto-generated YouTube Music mix playlist IDs
// These are personalized playlists YouTube creates for each user
const PERSONALIZED_MIXES = [
  { id: "RDTMAK5uy_kset8DisdE7LSD4TNjEVvrKRTmG7a56sY", title: "Liked Music", fallbackSubtitle: "Auto playlist" },
  { id: "RDTMAK5uy_nilrsVWxrKskY0ZUpVZ3zpB0u4LwWTVJ4", title: "Replay Mix", fallbackSubtitle: "Your top songs on repeat" },
  { id: "RDTMAK5uy_lu0Sfrht1ciFnpPjYOG6I_w0S3F0dAiLs", title: "Archive Mix", fallbackSubtitle: "Deep cuts you used to love" },
  { id: "RDTMAK5uy_n8Mul5YhCNxwbL4GQMSzmINJnOmSbhfsI", title: "Discover Mix", fallbackSubtitle: "New music based on your taste" },
  { id: "RDTMAK5uy_mr0JfXV2NbkVgNsBiENsxvbkVRkFCiSMQ", title: "New Release Mix", fallbackSubtitle: "Fresh tracks from artists you follow" },
  { id: "RDTMAK5uy_lz8JoeNgrU1mEXJqaRnCCDjQ2LBGXwV0Q", title: "My Supermix", fallbackSubtitle: "A mix of everything you love" },
];

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    const accessToken = token?.accessToken as string | undefined;

    if (!accessToken) {
      return NextResponse.json({ sections: [] });
    }

    // Fetch all personalized mix playlists in parallel
    const playlistIds = PERSONALIZED_MIXES.map((m) => m.id).join(",");

    // Try to get playlist details from YouTube API
    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${playlistIds}&maxResults=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const items: HomeSectionItem[] = [];

    if (playlistRes.ok) {
      const data = await playlistRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playlists = data.items || [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const pl of playlists) {
        const thumbnail =
          pl.snippet?.thumbnails?.high?.url ||
          pl.snippet?.thumbnails?.medium?.url ||
          pl.snippet?.thumbnails?.standard?.url ||
          pl.snippet?.thumbnails?.default?.url ||
          "";
        const title = pl.snippet?.title || "";
        const description = pl.snippet?.description || "";
        const channelTitle = pl.snippet?.channelTitle || "";

        // Build subtitle from description or channel
        let subtitle = description
          ? description.split("\n")[0].slice(0, 80)
          : channelTitle || "YouTube Music";

        // Match with our known mixes for better subtitles
        const knownMix = PERSONALIZED_MIXES.find((m) => m.id === pl.id);
        if (knownMix && !description) {
          subtitle = knownMix.fallbackSubtitle;
        }

        items.push({
          id: pl.id,
          title: title || knownMix?.title || "Mix",
          subtitle,
          thumbnail,
          playlistId: pl.id,
          type: "playlist",
        });
      }
    }

    // If the YouTube API didn't return some playlists (they may not be accessible via Data API),
    // also try fetching the user's auto-generated playlists by listing their channel playlists
    if (items.length < 3) {
      try {
        // Fetch user's playlists to find auto-generated mixes
        const myPlaylistsRes = await fetch(
          "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=25",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (myPlaylistsRes.ok) {
          const myData = await myPlaylistsRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const myPlaylists = myData.items || [];

          // Look for mix-type playlists (auto-generated ones usually have specific patterns)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const pl of myPlaylists) {
            const title = (pl.snippet?.title || "").toLowerCase();
            const id = pl.id || "";
            const alreadyAdded = items.some((i) => i.id === id);

            // Include playlists that look like mixes or auto-generated
            if (!alreadyAdded && (
              title.includes("mix") ||
              title.includes("liked") ||
              id.startsWith("RDTMAK") ||
              id.startsWith("RDEM") ||
              id === "LM" || // Liked Music
              id === "SE" // Saved episodes
            )) {
              const thumbnail =
                pl.snippet?.thumbnails?.high?.url ||
                pl.snippet?.thumbnails?.medium?.url ||
                pl.snippet?.thumbnails?.default?.url ||
                "";

              items.push({
                id,
                title: pl.snippet?.title || "Mix",
                subtitle: pl.snippet?.description?.split("\n")[0]?.slice(0, 80) || "Auto playlist",
                thumbnail,
                playlistId: id,
                type: "playlist",
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch user playlists for mixes:", err);
      }
    }

    // Also add Liked Music (LM) if not already present
    if (!items.some((i) => i.id === "LM" || i.title.toLowerCase().includes("liked music"))) {
      try {
        const likedRes = await fetch(
          "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LM&maxResults=1",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (likedRes.ok) {
          const likedData = await likedRes.json();
          const firstItem = likedData.items?.[0];
          const thumbnail = firstItem?.snippet?.thumbnails?.high?.url ||
            firstItem?.snippet?.thumbnails?.medium?.url || "";

          items.unshift({
            id: "LM",
            title: "Liked Music",
            subtitle: "Auto playlist",
            thumbnail,
            playlistId: "LM",
            type: "playlist",
          });
        }
      } catch {
        // Ignore
      }
    }

    const sections: HomeSection[] = [];
    if (items.length > 0) {
      sections.push({
        title: "Fresh finds, old favorites",
        items,
      });
    }

    return NextResponse.json({ sections });
  } catch (error) {
    console.error("Home sections fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch home sections", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
