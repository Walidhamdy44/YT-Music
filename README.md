# YT Music

A personal-use YouTube Music web client built with Next.js. Streams music from YouTube, supports playlists, search, and works as an installable PWA.

## Features
- **Music Streaming** — Stream audio from YouTube via `youtubei.js`
- **Search** — Search for tracks, albums, artists, and playlists
- **Home Feed** — Personalized home sections and browse content
- **Library** — Create/manage local playlists, like tracks, reorder songs
- **YouTube Playlists** — Browse and play your YouTube playlists
- **Albums** — View album details and play full albums
- **Queue Management** — Queue tracks, shuffle, repeat (none/all/one)
- **Mini Player** — Persistent bottom player with progress bar
- **Fullscreen Player** — Expanded player view
- **Radio** — Generate radio mixes from tracks
- **PWA** — Installable as a standalone app (manifest + service worker via next-pwa)
- **Google OAuth** — Sign in with Google (NextAuth) to access your YouTube library
- **Dark Theme** — Material Design 3 dark color system
- **Responsive** — Desktop sidebar + mobile bottom nav

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn/ui, Lucide icons |
| State Management | Zustand (persisted stores) |
| Auth | NextAuth v4 (Google OAuth) |
| YouTube Data | youtubei.js |
| Audio Playback | YouTube IFrame Player API |
| PWA | next-pwa (Workbox) |
| Storage | IndexedDB (via idb) for offline data |

## Project Structure

```
src/
├── app/
│   ├── api/          # Route handlers (stream, search, browse, library, etc.)
│   ├── album/[id]/   # Album detail page
│   ├── explore/      # Explore/browse page
│   ├── library/      # Local library & YouTube playlists
│   ├── playlist/[id] # Local playlist detail
│   ├── search/       # Search results page
│   ├── yt-playlist/[id] # YouTube playlist detail
│   ├── layout.tsx    # Root layout
│   └── page.tsx      # Home page
├── components/
│   ├── layout/       # AppShell, Header, Sidebar, MobileNav
│   ├── player/       # MiniPlayer, FullscreenPlayer, PlayerProvider
│   ├── track/        # TrackRow, AlbumCard, MixCard
│   └── ui/           # Button, Dialog, Slider, Sheet, etc.
├── lib/              # Utilities
├── stores/           # Zustand stores (player, queue, library, ui)
└── types/            # TypeScript interfaces (Track, Playlist, Album, etc.)
```

## Prerequisites

- Node.js 18+
- A Google Cloud project with:
  - OAuth 2.0 credentials (Client ID + Secret)
  - YouTube Data API v3 enabled
  - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

## Setup

1. Clone and install:
   ```bash
   git clone <repo-url>
   cd YT-Music
   npm install
   ```

2. Create `.env` from the example:
   ```bash
   cp .env.example .env
   ```

3. Fill in your environment variables:
   ```env
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<generate-a-random-secret>
   GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-<your-secret>
   ```

4. Run the dev server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## API Routes

| Endpoint | Purpose |
|----------|---------|
| `/api/search` | Search YouTube Music |
| `/api/home-sections` | Fetch home feed sections |
| `/api/browse` | Browse content (charts, new releases) |
| `/api/album` | Get album details and tracks |
| `/api/yt-playlist` | Get YouTube playlist details |
| `/api/library` | Access user's YouTube library |
| `/api/radio` | Generate radio queue from a track |
| `/api/auth/[...nextauth]` | NextAuth authentication endpoints |

## Notes

- This is a **personal-use** project — not intended for public distribution.
- Audio streaming relies on YouTube's infrastructure via unofficial libraries.
- Google OAuth scopes required: `openid`, `email`, `profile`, `youtube.readonly`.
