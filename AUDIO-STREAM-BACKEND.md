# Audio Stream Backend — Implementation Plan

> Build a backend endpoint that extracts audio from YouTube and serves it as a streamable audio file, enabling true background playback via a standard `<audio>` element.

---

## Table of Contents

1. [Goal](#goal)
2. [How It Works](#how-it-works)
3. [Why This Enables Background Playback](#why-this-enables-background-playback)
4. [Vercel Free Tier Constraints](#vercel-free-tier-constraints)
5. [Architecture](#architecture)
6. [API Endpoints to Build](#api-endpoints-to-build)
7. [Frontend Changes](#frontend-changes)
8. [Technical Details](#technical-details)
9. [Risks & Mitigations](#risks--mitigations)
10. [File Structure](#file-structure)
11. [Implementation Steps](#implementation-steps)
12. [Testing Plan](#testing-plan)
13. [Known Limitations](#known-limitations)

---

## Goal

Replace the YouTube IFrame Player with a standard HTML `<audio>` element that plays audio streamed from our own backend. This removes YouTube's background-pause restriction entirely.

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│ CURRENT (broken background)                             │
│                                                         │
│ Browser → YouTube IFrame → YouTube controls playback    │
│         → YouTube pauses when backgrounded              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ NEW (background works)                                  │
│                                                         │
│ Browser <audio> element                                 │
│     ↓ requests audio from                              │
│ /api/audio/[videoId]                                    │
│     ↓ uses youtubei.js to get CDN URL                  │
│     ↓ redirects browser to YouTube CDN directly        │
│                                                         │
│ Browser <audio> plays from YouTube CDN                  │
│     → Background playback works natively               │
│     → Media Session API shows lock screen controls     │
│     → Seeking works via HTTP Range requests            │
└─────────────────────────────────────────────────────────┘
```

---

## Why This Enables Background Playback

| Player Type | Background Behavior |
|-------------|-------------------|
| YouTube IFrame | YouTube **server-side** detects hidden page → pauses stream |
| Standard `<audio>` element | Browser keeps audio session alive → **plays in background** |

A standard `<audio>` element with a valid audio source URL plays in the background on all platforms (Chrome Android, Safari iOS, desktop) because the browser treats it as a normal media element — no YouTube restriction applies.

---

## Vercel Free Tier Constraints

| Limit | Value | Impact |
|-------|-------|--------|
| **Function timeout** | 10 seconds (Hobby) | Cannot proxy entire audio file through the function — must **redirect** to the CDN URL instead |
| **Response size** | 4.5 MB (streaming) | Too small for full audio proxy — confirms we must redirect |
| **Bandwidth** | 100 GB/month | If we redirect, bandwidth is between YouTube CDN and the browser directly — doesn't count against Vercel |
| **Invocations** | 100,000/month | Each track play = 1 invocation. ~3,300 plays/day is plenty |
| **Cold starts** | ~500ms-2s | Acceptable for initial play — add loading state |

### Key Decision: Redirect, Don't Proxy

Because of the 10-second timeout and 4.5MB limit, we **cannot** pipe audio bytes through the Vercel function. Instead:

1. The endpoint extracts the direct YouTube CDN audio URL using `youtubei.js`
2. Returns a **302 redirect** to that CDN URL
3. The browser's `<audio>` element follows the redirect and streams directly from YouTube's CDN

This means:
- ✅ Zero bandwidth on Vercel (audio goes directly YouTube CDN → browser)
- ✅ No timeout issues (endpoint only needs ~2-4 seconds to extract the URL)
- ✅ Seeking works (YouTube CDN supports Range requests)
- ⚠️ CDN URL expires after ~6 hours (need a refresh mechanism)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React)                                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  <audio src="/api/audio/VIDEO_ID" />                         │
│     ├── Media Session API (lock screen controls)             │
│     ├── timeupdate → progress bar                            │
│     ├── ended → next track                                   │
│     └── error → retry with fresh URL / skip                  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Backend API Route: /api/audio/[videoId]                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Validate videoId format                                  │
│  2. Check in-memory cache for existing CDN URL               │
│  3. If miss: use youtubei.js to extract audio stream info    │
│  4. Select best audio-only stream (opus/m4a, highest bitrate)│
│  5. Cache the URL with expiry                                │
│  6. Return 302 redirect to CDN URL                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Backend API Route: /api/audio-info/[videoId]                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Returns JSON with:                                          │
│  - audioUrl (direct CDN URL for manual control)              │
│  - mimeType                                                  │
│  - bitrate                                                   │
│  - duration                                                  │
│  - expiresAt                                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## API Endpoints to Build

### 1. `GET /api/audio/[videoId]` — Audio Redirect

**Purpose**: Returns a 302 redirect to the actual YouTube CDN audio URL.

**Request**:
```
GET /api/audio/dQw4w9WgXcQ
```

**Response** (success):
```
HTTP/1.1 302 Found
Location: https://rr3---sn-xxx.googlevideo.com/videoplayback?...
Cache-Control: private, max-age=3600
```

**Response** (error):
```
HTTP/1.1 404 Not Found
{ "error": "Video not available" }
```

**Response** (invalid ID):
```
HTTP/1.1 400 Bad Request
{ "error": "Invalid video ID" }
```

**Logic**:
1. Validate videoId matches `^[A-Za-z0-9_-]{11}$`
2. Check cache (Map or simple object) for non-expired URL
3. If not cached, call `youtubei.js` to get streaming data
4. Pick the best audio-only adaptive format (prefer opus > m4a, highest bitrate)
5. Store URL in cache with TTL of 5 hours (URLs expire ~6h)
6. Redirect (302) to the CDN URL

---

### 2. `GET /api/audio-info/[videoId]` — Stream Info (JSON)

**Purpose**: Returns the stream metadata so the frontend can set `<audio src>` directly and manage caching/refresh.

**Request**:
```
GET /api/audio-info/dQw4w9WgXcQ
```

**Response**:
```json
{
  "audioUrl": "https://rr3---sn-xxx.googlevideo.com/videoplayback?...",
  "mimeType": "audio/webm; codecs=\"opus\"",
  "bitrate": 128000,
  "duration": 212,
  "expiresAt": 1722200000000,
  "videoId": "dQw4w9WgXcQ"
}
```

**Why both endpoints?**

- `/api/audio/[videoId]` — Simple, just set `<audio src="/api/audio/ID">`. Browser follows redirect. No JS needed to manage URLs.
- `/api/audio-info/[videoId]` — For advanced control: pre-fetch URLs, cache on client, detect expiry, refresh without reloading the audio element.

The frontend will primarily use `/api/audio-info/[videoId]` for better control over the audio element lifecycle.

---

## Frontend Changes

### PlayerProvider Changes

Replace YouTube IFrame with a standard `<audio>` element:

```tsx
// Before: YouTube IFrame (hidden, 0x0)
<div id="yt-iframe-player" />

// After: Standard audio element
<audio
  ref={audioRef}
  src={streamUrl}
  preload="auto"
  onTimeUpdate={handleTimeUpdate}
  onDurationChange={handleDurationChange}
  onPlay={() => setStatus("playing")}
  onPause={() => setStatus("paused")}
  onEnded={handleTrackEnd}
  onError={handleError}
  onWaiting={() => setStatus("loading")}
  onCanPlay={() => {/* ready */}}
/>
```

### Key Frontend Behaviors

| Feature | Implementation |
|---------|---------------|
| Play/Pause | `audioRef.current.play()` / `.pause()` |
| Seek | `audioRef.current.currentTime = seconds` |
| Volume | `audioRef.current.volume = 0-1` |
| Mute | `audioRef.current.muted = true/false` |
| Duration | `audioRef.current.duration` (from `durationchange` event) |
| Progress | `audioRef.current.currentTime` (from `timeupdate` event) |
| Background play | **Works automatically** — no extra code needed |
| Lock screen controls | Media Session API (already implemented, just wire to `<audio>`) |
| Track loading | Fetch `/api/audio-info/[videoId]` → set `audioRef.current.src = audioUrl` |
| URL expiry | Track `expiresAt`, refresh URL before it expires |

### URL Refresh Strategy

```ts
// When playing, check if URL is about to expire
const URL_REFRESH_BUFFER = 10 * 60 * 1000; // 10 minutes before expiry

function shouldRefreshUrl(expiresAt: number): boolean {
  return Date.now() > expiresAt - URL_REFRESH_BUFFER;
}

// On timeupdate, if URL is about to expire:
// 1. Fetch new URL from /api/audio-info/[videoId]
// 2. Note current position
// 3. Set new src
// 4. Seek to saved position
// 5. Resume playback
```

---

## Technical Details

### youtubei.js Audio Extraction

`youtubei.js` (already in your dependencies) can extract adaptive audio streams:

```ts
import { Innertube } from "youtubei.js";

const yt = await Innertube.create();
const info = await yt.getBasicInfo(videoId);

// Get audio-only adaptive formats
const audioFormats = info.streaming_data?.adaptive_formats
  ?.filter(f => f.mime_type?.startsWith("audio/"))
  ?.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

const bestAudio = audioFormats?.[0];
// bestAudio.url = direct CDN URL
// bestAudio.mime_type = "audio/webm; codecs=\"opus\"" or "audio/mp4; codecs=\"mp4a.40.2\""
// bestAudio.bitrate = 128000 or 256000
```

### Preferred Audio Format Selection

Priority order:
1. **audio/mp4 (AAC)** — best compatibility across all browsers and mobile
2. **audio/webm (Opus)** — better quality per bitrate, but Safari support varies
3. Highest bitrate within each format

```ts
function selectBestAudio(formats: Format[]): Format | null {
  // Prefer MP4/AAC for universal compatibility
  const mp4 = formats
    .filter(f => f.mime_type?.includes("audio/mp4"))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  
  if (mp4.length > 0) return mp4[0];
  
  // Fallback to WebM/Opus
  const webm = formats
    .filter(f => f.mime_type?.includes("audio/webm"))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  
  return webm[0] ?? null;
}
```

### In-Memory URL Cache

Since Vercel serverless functions are stateless (cold starts reset memory), the cache helps within a single function instance:

```ts
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 60 * 1000; // 5 hours

function getCachedUrl(videoId: string): string | null {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }
  urlCache.delete(videoId);
  return null;
}
```

Note: This cache only helps within a warm function instance. Cold starts will always call `youtubei.js`. This is fine for personal use.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **YouTube blocks the server IP** | Low (personal use, low volume) | Use different Vercel regions; self-host if blocked |
| **Stream URL expires mid-play** | Medium (songs > 6 hours long: no; normal songs: fine) | Frontend detects expiry, fetches fresh URL, seeks to position |
| **youtubei.js breaks after YouTube update** | Medium (happens every few months) | Keep `youtubei.js` updated; fallback to IFrame player |
| **Vercel function timeout** | Low (extraction takes 2-4s, limit is 10s) | Monitor; if consistently slow, cache aggressively |
| **YouTube ToS violation** | Certain | Personal use only, never make public, never monetize |
| **CORS issues with CDN URL** | Low (YouTube CDN generally allows audio fetch) | If blocked, switch to proxy mode on a VPS |
| **iOS Safari audio restrictions** | Low | Require user gesture for first play (already standard) |
| **Cold start latency** | Medium | Show loading state; pre-fetch next track's URL |

---

## File Structure

```
src/app/api/
├── audio/
│   └── [videoId]/
│       └── route.ts          ← 302 redirect to CDN URL
├── audio-info/
│   └── [videoId]/
│       └── route.ts          ← JSON with stream URL + metadata
└── (existing routes remain unchanged)

src/components/player/
├── PlayerProvider.tsx         ← Replace YT IFrame with <audio> element
├── MiniPlayer.tsx            ← No changes needed (uses store)
└── FullscreenPlayer.tsx      ← Remove YT player container, show album art

src/lib/
└── youtube-audio.ts          ← Shared extraction logic

src/types/
└── index.ts                  ← Update StreamInfo type
```

---

## Implementation Steps

### Phase 1: Backend (API Routes)

1. Create `/api/audio-info/[videoId]/route.ts`
   - Validate video ID
   - Extract audio stream using `youtubei.js`
   - Return JSON with URL, mime type, bitrate, duration, expiry

2. Create `/api/audio/[videoId]/route.ts`
   - Validate video ID
   - Extract or get cached URL
   - Return 302 redirect

3. Create `src/lib/youtube-audio.ts`
   - Shared `Innertube` instance creation
   - Audio format selection logic
   - URL cache management

### Phase 2: Frontend (Player Rewrite)

4. Update `PlayerProvider.tsx`
   - Remove YouTube IFrame API loading
   - Remove YT.Player instance management
   - Add `<audio>` element with ref
   - Wire play/pause/seek/volume to native audio APIs
   - Add URL expiry detection and refresh
   - Keep Media Session API (rewire to `<audio>` events)

5. Update `playerStore.ts`
   - Update `StreamInfo` type to include `expiresAt`
   - Add `audioUrl` field for the current CDN URL

6. Remove YouTube-specific code
   - Delete `src/types/youtube.d.ts` (no longer needed)
   - Remove YouTube IFrame script loading
   - Remove `window.YT` / `window.onYouTubeIframeAPIReady`
   - Remove visible player container/CSS

### Phase 3: Polish

7. Error handling
   - Network errors → retry with fresh URL
   - Unavailable video → auto-skip (existing behavior)
   - Expired URL → transparent refresh

8. Pre-fetching
   - When current track is at 75%, pre-fetch next track's URL
   - Eliminates gap between tracks

9. Update README
   - Remove YouTube IFrame references
   - Document the audio stream architecture
   - Update known issues

---

## Testing Plan

### Desktop
- [ ] Play a track — audio starts
- [ ] Switch tabs — audio continues
- [ ] Close the tab — audio stops (expected)
- [ ] Seek — position jumps correctly
- [ ] Volume slider — works
- [ ] Next/Previous — loads new track
- [ ] Shuffle/Repeat — works as before

### Android (Chrome)
- [ ] Play a track
- [ ] Switch to another app — **audio continues** ✓
- [ ] Lock screen — **audio continues** ✓
- [ ] Lock screen controls (Media Session) — play/pause/next/prev work
- [ ] Return to app — UI is synced with playback position

### iOS (Safari)
- [ ] Play a track (requires user gesture)
- [ ] Switch to another app — **audio continues** ✓
- [ ] Lock screen — **audio continues** ✓
- [ ] Control Center controls work
- [ ] Return to app — UI synced

### Edge Cases
- [ ] Play a region-restricted track — auto-skips
- [ ] Play an unavailable track — error + auto-skip
- [ ] Play for 5+ hours — URL refresh works seamlessly
- [ ] Rapid next/next/next — no crashes
- [ ] Network disconnect mid-play — handles gracefully

---

## Known Limitations

| Limitation | Details |
|-----------|---------|
| **YouTube ToS** | This approach extracts audio streams, which violates YouTube's Terms of Service. Personal use only. |
| **No video** | The YouTube video content is not shown. Audio only. |
| **CDN URL expiry** | URLs expire ~6 hours. Long listening sessions need refresh logic. |
| **Cold start** | First play after inactivity may take 2-4 seconds (Vercel cold start + youtubei.js extraction). |
| **Vercel bandwidth** | If using redirect (302), Vercel bandwidth is minimal. If you ever need to proxy, consider a VPS. |
| **youtubei.js maintenance** | YouTube occasionally changes internal APIs, breaking youtubei.js. Keep it updated. |
| **No YouTube branding** | Since we're not using the IFrame, YouTube's required branding is not shown. This is another ToS point. |

---

## Cost Summary

| Component | Cost |
|-----------|------|
| Vercel Hobby plan | **$0/month** |
| Vercel bandwidth (redirect mode) | **$0** (audio streams directly from YouTube CDN to browser) |
| Vercel invocations | **$0** (well within 100K/month for personal use) |
| `youtubei.js` | **Free** (open source, already in project) |
| Total | **$0/month** |

---

## Summary

| What | Before | After |
|------|--------|-------|
| Audio source | YouTube IFrame Player | Standard `<audio>` element |
| Background play | ❌ YouTube pauses it | ✅ Works natively |
| Lock screen controls | ⚠️ Unreliable | ✅ Media Session + real audio |
| Server bandwidth | None | Negligible (302 redirects only) |
| YouTube ToS | ✅ Compliant | ⚠️ Violates (personal use only) |
| Seeking | Via YouTube API | Native `<audio>` seeking |
| Dependencies | YouTube IFrame API | youtubei.js (already installed) |

---

*This is a personal-use implementation. Do not deploy publicly or monetize.*
