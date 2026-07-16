import { NextResponse } from "next/server";
import { existsSync } from "fs";
import path from "path";

const COOKIES_PATH = path.join(process.cwd(), "cookies.txt");

export async function GET() {
  const hasCookies = existsSync(COOKIES_PATH);

  return NextResponse.json({
    hasCookies,
    cookiesPath: COOKIES_PATH,
    instructions: [
      "1. Install the 'Get cookies.txt LOCALLY' Chrome extension (or similar Netscape cookies exporter)",
      "2. Go to https://music.youtube.com and make sure you're signed in",
      "3. Click the extension icon and export cookies for music.youtube.com",
      "4. Save the file as 'cookies.txt' in the ytmusic-web project root folder",
      `5. The file should be at: ${COOKIES_PATH}`,
      "6. Refresh the Library page — your liked songs and playlists will appear",
    ],
  });
}
