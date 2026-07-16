export interface Track {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  duration: number; // seconds
  thumbnail: string;
  thumbnailLarge?: string;
  isExplicit?: boolean;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  trackCount: number;
  tracks: Track[];
  isLocal: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface Artist {
  id: string;
  name: string;
  thumbnail: string;
  subscribers?: string;
  description?: string;
  topTracks?: Track[];
  albums?: Album[];
  singles?: Album[];
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  thumbnail: string;
  year?: number;
  trackCount?: number;
  tracks?: Track[];
  type: "album" | "single" | "ep";
}

export interface QueueState {
  tracks: Track[];
  currentIndex: number;
  history: Track[];
  shuffleOrder?: number[];
}

export interface StreamInfo {
  url: string;
  mimeType: string;
  bitrate: number;
  duration: number;
  expiresAt: number;
  videoId: string;
}

export interface SearchResult {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

export type RepeatMode = "none" | "all" | "one";
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface BrowseSection {
  title: string;
  type: "tracks" | "albums" | "artists" | "playlists";
  items: (Track | Album | Artist | Playlist)[];
}
