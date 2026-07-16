// YouTube IFrame Player API type declarations

declare namespace YT {
  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: PlayerVars;
    events?: Events;
  }

  interface PlayerVars {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    disablekb?: 0 | 1;
    fs?: 0 | 1;
    iv_load_policy?: 1 | 3;
    modestbranding?: 0 | 1;
    rel?: 0 | 1;
    showinfo?: 0 | 1;
    origin?: string;
    playsinline?: 0 | 1;
  }

  interface Events {
    onReady?: (event: PlayerEvent) => void;
    onStateChange?: (event: OnStateChangeEvent) => void;
    onError?: (event: OnErrorEvent) => void;
    onPlaybackQualityChange?: (event: PlayerEvent) => void;
  }

  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent {
    data: number;
    target: Player;
  }

  interface OnErrorEvent {
    data: number;
    target: Player;
  }

  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions);
    loadVideoById(options: { videoId: string; startSeconds?: number }): void;
    loadVideoById(videoId: string, startSeconds?: number): void;
    cueVideoById(options: { videoId: string; startSeconds?: number }): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    setSize(width: number, height: number): void;
    getPlayerState(): number;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoUrl(): string;
    getVideoEmbedCode(): string;
    destroy(): void;
  }
}
