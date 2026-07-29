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

    if (!q || q.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const yt = await getInnertube();
    const suggestions = await yt.music.getSearchSuggestions(q);
    
    // Extract suggestion strings
    const results = suggestions
      .map((item) => {
        // Handle different suggestion types
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "query" in item) {
          return (item as { query: string }).query;
        }
        // Try to get text from suggestion object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const suggestion = item as any;
        if (suggestion?.suggestion?.text) return suggestion.suggestion.text;
        if (suggestion?.text) return suggestion.text;
        return null;
      })
      .filter((s): s is string => s !== null && s.length > 0)
      .slice(0, 8);

    return NextResponse.json({ suggestions: results });
  } catch (error) {
    console.error("Suggestions error:", error);
    return NextResponse.json({ suggestions: [] });
  }
}
