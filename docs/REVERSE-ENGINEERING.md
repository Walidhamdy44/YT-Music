# Reverse Engineering — YouTube Music Personal App

> A complete technical record of every YouTube / YouTube Music private API,
> internal protocol, and undocumented behaviour we discovered and exploited
> to build this personal-use clone.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [YouTube CDN — audio URL extraction](#2-youtube-cdn--audio-url-extraction)
3. [YouTube Innertube API](#3-youtube-innertube-api)
4. [YouTube Music personalised data](#4-youtube-music-personalised-data)
5. [ytmusicapi — cookie-based auth](#5-ytmusicapi--cookie-based-auth)
6. [Signed URL lifecycle](#6-signed-url-lifecycle)
7. [Range requests & seeking](#7-range-requests--seeking)
8. [Streaming vs download — why two endpoints](#8-streaming-vs-download--why-two-endpoints)
9. [iOS PWA — Cache API quirks](#9-ios-pwa--cache-api-quirks)
10. [IndexedDB — shared DB version management](#10-indexeddb--shared-db-version-management)
11. [Ngrok — tunnelling the local backend](#11-ngrok--tunnelling-the-local-backend)

---

## 1. Architecture overview

```
Mobile / Browser  ──▶  Vercel (Next.js)  ──▶  ngrok tunnel  ──▶  Local Python FastAPI
                            │                                           │
                            │ /api/audio, /api/download                │ yt-dlp  ──▶  YouTube CDN
                            │ /api/browse, /api/search                 │ ytmusicapi ──▶  YT Music API
                            │ /api/listen-again                        │
                            ▼
                       Browser Cache API  ◀── offline audio blobs
                       IndexedDB          ◀── metadata + folders
```

Key insight: YouTube has no public API for audio streaming. Every technique
below is reverse-engineered from the browser network traffic of
`music.youtube.com`.

---

## 2. YouTube CDN — audio URL extraction

### The problem

YouTube does not expose a stable, permanent URL for a song's audio.
Every audio file lives on `*.googlevideo.com` behind a **signed, time-limited
URL** that expires in approximately **6 hours**.

### How we extract it

We use **yt-dlp** — a battle-tested open-source downloader that reverse-engineers
YouTube's internal player JavaScript to decode the signature cipher and produce
a valid CDN URL.

```python
opts = {
    "skip_download": True,          # we only need the URL, not the file
    "format": "bestaudio/best",
    "extractor_args": {
        "youtube": {
            "player_client": ["android_vr"]  # ← key trick (see below)
        }
    },
}
with yt_dlp.YoutubeDL(opts) as ydl:
    info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}",
                            download=False)
audio_url = info["url"]   # e.g. https://rr3.googlevideo.com/videoplayback?...
```

### Why `android_vr` player client?

YouTube serves different responses to different clients.  
The `android_vr` client skips the throttling throttle token and returns
audio streams with `clen` (content length) intact — which we need for
progress tracking.  
Other clients (web, iOS) use JavaScript signature obfuscation that yt-dlp
has to break at runtime; `android_vr` uses a simpler HMAC signature.

### URL structure (decoded)

```
https://rr3---sn-vg5obxxb.googlevideo.com/videoplayback
  ?expire=1786021948          ← Unix timestamp when URL dies
  &ei=<session-id>
  &ip=<your-ip>               ← IP-locked! Can't share with another machine
  &id=o-<stream-id>
  &itag=251                   ← 251 = WebM Opus audio (best quality)
  &clen=2934859               ← exact byte count of the file
  &sig=AE0s2JY...             ← cryptographic signature
```

### 5-hour server-side cache

Extracting a URL takes ~1 second (yt-dlp calls YouTube's player endpoint).
We cache the result for 5 hours:

```python
url_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 5 * 60 * 60  # 5 hours (URLs expire after 6 h)
```

On a **403 Forbidden** mid-stream the cache entry is evicted and the URL
is re-extracted transparently.

---

## 3. YouTube Innertube API

### What it is

`Innertube` is YouTube's internal RPC protocol, used by every first-party
YouTube client (web, iOS, Android, TV, VR).  
All requests go to:

```
POST https://music.youtube.com/youtubei/v1/<action>?prettyPrint=false
```

with a JSON body containing a `context` object identifying the client, and
an `Authorization: SAPISIDHASH …` header built from the session cookies.

### How we use it (frontend)

We use the **youtubei.js** npm library, which wraps the Innertube API:

```typescript
const yt = await Innertube.create({ lang: "en", location: "EG" });
const results = await yt.music.search("amr diab", { type: "song" });
```

Under the hood `youtubei.js` reverse-engineers the same client context and
request signing that the YouTube Music web app uses.

### Endpoints we call

| Action | Innertube browseId / method | What we get |
|---|---|---|
| Home feed (Quick Picks) | `yt.music.search(query)` | Song shelf |
| Albums for you | `yt.music.search(artist, { type: "album" })` | Album shelf |
| Artist page | `yt.music.getArtist(id)` | Bio, top tracks, albums |
| Album tracks | `yt.music.getAlbum(id)` | Full track listing |
| Radio / related | `yt.music.getWatchPlaylist(videoId)` | Up-next queue |

### Why Innertube instead of the YouTube Data API v3?

The public Data API v3 doesn't expose:
- Audio stream URLs (no `/download` or `/stream`)
- YouTube Music–specific metadata (lyrics, mood, genre)
- "Listen Again" / recently played
- Radio / autoplay queues

---

## 4. YouTube Music personalised data

### The `FEmusic_listen_again` endpoint

The "Listen Again" shelf on YouTube Music's home page is served by:

```
POST https://music.youtube.com/youtubei/v1/browse
Body: { "browseId": "FEmusic_listen_again", "params": "ggMEgAKgAw==" }
```

This returns a deeply-nested Innertube response tree.  
The track list is at:

```
response
  .contents
  .singleColumnBrowseResultsRenderer
  .tabs[0]
  .tabRenderer
  .content
  .sectionListRenderer
  .contents[0]
  .musicCarouselShelfRenderer
  .contents[]                   ← array of musicTwoRowItemRenderer objects
    .navigationEndpoint.watchEndpoint.videoId
    .title.runs[0].text
    .subtitle.runs[0].text      ← artist
    .thumbnailRenderer…
```

### Why OAuth tokens don't work here

The Google OAuth access token granted by `next-auth` via Google Sign-In
only covers the **YouTube Data API v3** scope (`youtube.readonly`).

The `FEmusic_listen_again` endpoint is an **Innertube internal API**
protected by YouTube's own cookie-based session (`SAPISID`, `SID`,
`__Secure-1PSID`, etc.) — completely separate from OAuth.

The `Authorization` header it expects is:

```
SAPISIDHASH <timestamp>_<SHA1(timestamp + " " + SAPISID + " " + origin)>
```

### Our solution — ytmusicapi with browser cookies

We export the cookies from a logged-in Chrome session as a Netscape cookie
file and convert them to the JSON auth format that `ytmusicapi` expects:

```python
# Build SAPISIDHASH from the SAPISID cookie value
SAPISID = "qw6lYV_zuypC9VXq/AXU0u9rYHxmWD3Nvs"
ts = int(time.time())
h = hashlib.sha1(f"{ts} {SAPISID} https://music.youtube.com".encode()).hexdigest()
auth_headers = {
    "Authorization": f"SAPISIDHASH {ts}_{h}",
    "Cookie": "SAPISID=…; SID=…; __Secure-3PSID=…",
    ...
}
```

`ytmusicapi` accepts this JSON and uses it for every request.

---

## 5. ytmusicapi — cookie-based auth

### Auth file format

`ytmusicapi` needs a JSON file with HTTP headers, not raw cookies:

```json
{
  "User-Agent": "Mozilla/5.0 …",
  "Authorization": "SAPISIDHASH 1786027852_c04f9accba7ec475f71a0078afa…",
  "Cookie": "SAPISID=qw6lYV…; SID=g.a000Awm…; __Secure-1PSID=g.a000…",
  "X-Goog-AuthUser": "0",
  "x-origin": "https://music.youtube.com"
}
```

The `SAPISIDHASH` is time-based and must be regenerated whenever the backend
restarts (the SAPISID itself is valid until ~2027).

### What we can read with it

```python
yt = YTMusic("ytmusic_auth.json")
home = yt.get_home(limit=6)
# → list of dicts, one per shelf
# Each shelf has: "title", "contents" (list of track dicts)
```

Sections returned include:
- **Listen again** — tracks recently played or frequently played
- **Quick picks** — algorithmic recommendations
- **Recommended albums** / **New releases** / **Celebrating <artist>**

---

## 6. Signed URL lifecycle

```
yt-dlp extracts URL  →  valid for ~6 hours  →  403 on first chunk
        │                                              │
        ▼                                              ▼
  cache for 5 h                            evict + re-extract
```

### Why `read=None` timeout matters

YouTube CDN **throttles** audio delivery — it intentionally sends chunks
slower than real-time to prevent bulk downloading.
Setting `httpx.Timeout(read=None)` tells the HTTP client to wait indefinitely
between chunks, which prevents `ReadTimeout` errors mid-stream:

```python
STREAM_TIMEOUT = httpx.Timeout(connect=30.0, read=None, write=30.0, pool=30.0)
```

### Why we never forward `Content-Length` on streaming responses

YouTube CDN sometimes delivers **fewer bytes than the `clen` parameter
advertises** (throttling, redirects, partial content).  
If we forwarded `Content-Length` from the CDN to the browser, uvicorn would
crash with:

```
RuntimeError: Response content shorter than Content-Length
```

Solution: omit `Content-Length` on the `/audio` streaming endpoint.
Only the `/download` endpoint forwards it (because that endpoint streams
from a fully-received CDN response).

---

## 7. Range requests & seeking

Audio seeking in the HTML5 `<audio>` element works via HTTP Range requests:

```
GET /audio/VIDEO_ID
Range: bytes=0-1           ← browser checks if range is supported
→  206 Partial Content
   Content-Range: bytes 0-1/2934859
   Accept-Ranges: bytes

GET /audio/VIDEO_ID
Range: bytes=1200000-      ← user scrubs to 40% of the song
→  206 Partial Content
```

Our proxy forwards the `Range` header from the browser to the YouTube CDN
and passes the `206` response and `Content-Range` header back:

```python
range_header = request.headers.get("range")
if range_header:
    req_headers["Range"] = range_header
```

---

## 8. Streaming vs download — why two endpoints

| Endpoint | Use case | Content-Length | Range support |
|---|---|---|---|
| `GET /audio/{id}` | Playback | ❌ omitted | ✅ yes |
| `GET /download/{id}` | Offline caching | ✅ forwarded | ❌ no |

**Why download needs `Content-Length`:** The browser's `ReadableStream` reader
uses it to calculate `received / total` for progress percentage.
Without it the progress bar is stuck until the whole file arrives.

**Why streaming must omit it:** CDN may send fewer bytes than `clen`, crashing
uvicorn if the declared length doesn't match the actual body length.

---

## 9. iOS PWA — Cache API quirks

### Problem: `cache.put()` silently fails

On iOS Safari PWA, the Cache API requires:

1. **Absolute URLs** as cache keys — relative paths like `/offline-audio/id`
   are silently rejected.
2. An explicit `new Request(url)` object — a plain string fails on older
   WebKit versions.
3. The `Response` must have `status: 200` set explicitly.

### Our fix

```typescript
const origin = window.location.origin;   // e.g. https://myapp.vercel.app
const cacheKey = `${origin}/offline-audio/${videoId}`;

const request  = new Request(cacheKey, { method: "GET" });
const response = new Response(audioBlob, {
  status: 200,
  statusText: "OK",
  headers: {
    "Content-Type": audioBlob.type || "audio/webm",
    "Content-Length": audioBlob.size.toString(),
    "X-Cached-At": Date.now().toString(),
  },
});

await cache.put(request, response);
```

### Storage quota on iOS

| Context | Quota |
|---|---|
| Normal browser tab | ~50 MB |
| PWA (Add to Home Screen) + `navigator.storage.persist()` granted | Up to 1 GB (iOS 16.4+) |

We removed the old hard-coded `100 MB` `MIN_FREE_SPACE` guard (which was
larger than the entire quota on a browser tab) and replaced it with a 2 MB
safety buffer, using `navigator.storage.estimate()` for the real quota.

---

## 10. IndexedDB — shared DB version management

### The race condition

Both `CacheMetadataStore` and `SavedUrlStore` originally opened the same
`yt-music-offline` database independently with `indexedDB.open(DB_NAME, N)`.

If two `open()` calls with the same version race, only one gets
`onupgradeneeded` — the other sees the DB already at that version and
skips the upgrade entirely.  
This left the `saved-urls` object store never created.

### Fix — single shared initialiser

`offlineDb.ts` exports a single `getOfflineDb()` function that opens the DB
exactly once and creates all stores in one `onupgradeneeded`:

```typescript
// DB_VERSION = 4 (current)
// v1: cached-tracks
// v3: saved-urls
// v4: offline-folders
```

All stores are created in the same transaction, eliminating the race.

---

## 11. Ngrok — tunnelling the local backend

### Why ngrok

The Python backend runs on `localhost:8000`.
Mobile devices (especially on the Vercel deployment) cannot reach `localhost`.
Ngrok creates a public HTTPS tunnel:

```
https://jazz-nutlike-earthworm.ngrok-free.app  →  localhost:8000
```

### The ngrok browser warning

Free ngrok accounts add an interstitial HTML page when a URL is first opened
in a browser.  
We bypass it with a header:

```
ngrok-skip-browser-warning: true
```

This header is added by every Next.js API route that proxies to the backend.

### Auto-updating the backend URL

Every time ngrok restarts it gets a new random subdomain.
Our `start-music-backend.ps1` startup script:

1. Starts Python uvicorn
2. Starts ngrok
3. Queries the local ngrok API (`http://localhost:4040/api/tunnels`) for the URL
4. Updates `YT-Music/.env` locally
5. PATCHes `AUDIO_BACKEND_URL` on Vercel via the Vercel REST API

```powershell
$ngrokApi = Invoke-RestMethod "http://localhost:4040/api/tunnels"
$ngrokUrl = ($ngrokApi.tunnels | Where-Object { $_.proto -eq "https" }).public_url
```

### Data limit

The ngrok free plan has a monthly bandwidth cap (~1 GB).
Audio files are 2–5 MB each, so streaming 200–500 songs exhausts the quota.
Mitigation: users download songs for offline use so the same URL is only
fetched once per song.

---

## Appendix — key file map

| File | Purpose |
|---|---|
| `backend_python/audio-backend/main.py` | FastAPI server — URL extraction, streaming, download, listen-again |
| `YT-Music/src/app/api/audio/[videoId]/route.ts` | Next.js proxy — streaming playback |
| `YT-Music/src/app/api/download/[videoId]/route.ts` | Next.js proxy — offline download |
| `YT-Music/src/app/api/listen-again/route.ts` | Next.js proxy → Python `/listen-again` |
| `YT-Music/src/app/api/browse/route.ts` | Home page sections via YouTube Data API v3 + youtubei.js |
| `YT-Music/src/lib/offlinePlaybackService.ts` | Download orchestration, Cache API writes |
| `YT-Music/src/lib/audioCache.ts` | Cache API wrapper (iOS-compatible) |
| `YT-Music/src/lib/offlineDb.ts` | Single shared IndexedDB opener |
| `backend_python/audio-backend/ytmusic_auth.json` | SAPISIDHASH auth headers for ytmusicapi |
| `start-music-backend.ps1` | Startup script — Python + ngrok + Vercel env update |
