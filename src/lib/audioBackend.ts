const configuredAudioBackendUrl =
  process.env.AUDIO_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BACKEND_URL ||
  "http://localhost:8000";

// Route handlers add their own leading slash, so keep the base URL slash-free.
export const AUDIO_BACKEND_URL = configuredAudioBackendUrl
  .trim()
  .replace(/\/+$/, "");
