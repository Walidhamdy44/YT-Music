import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid videoId" }, { status: 400 });
  }

  try {
    const url = `https://music.youtube.com/watch?v=${videoId}`;

    // Use yt-dlp to stream audio to stdout
    // -f bestaudio: best audio format
    // -o -: output to stdout
    // --no-warnings: suppress warnings
    const ytdlp = spawn("yt-dlp", [
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "-o", "-",
      "--no-warnings",
      "--no-check-certificates",
      "--quiet",
      url,
    ]);

    // Convert the Node.js child process stdout to a web ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        ytdlp.stdout.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        ytdlp.stdout.on("end", () => {
          controller.close();
        });

        ytdlp.stderr.on("data", (data: Buffer) => {
          const msg = data.toString();
          if (msg.includes("ERROR")) {
            console.error("yt-dlp error:", msg);
          }
        });

        ytdlp.on("error", (err) => {
          console.error("yt-dlp spawn error:", err);
          controller.error(err);
        });

        ytdlp.on("close", (code) => {
          if (code !== 0 && code !== null) {
            console.error("yt-dlp exited with code:", code);
          }
        });
      },
      cancel() {
        ytdlp.kill("SIGTERM");
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mp4",
        "Accept-Ranges": "none",
        "Cache-Control": "public, max-age=3600",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: unknown) {
    console.error("Stream error:", error);
    return NextResponse.json(
      {
        error: "Stream failed",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
