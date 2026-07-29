declare module "next-pwa" {
  import type { NextConfig } from "next";

  interface RuntimeCacheEntry {
    urlPattern: RegExp | string;
    handler: "CacheFirst" | "CacheOnly" | "NetworkFirst" | "NetworkOnly" | "StaleWhileRevalidate";
    options?: {
      cacheName?: string;
      expiration?: {
        maxEntries?: number;
        maxAgeSeconds?: number;
      };
      networkTimeoutSeconds?: number;
      cacheableResponse?: {
        statuses?: number[];
      };
    };
  }

  interface PWAConfig {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
    runtimeCaching?: RuntimeCacheEntry[];
    buildExcludes?: (string | RegExp)[];
    publicExcludes?: string[];
    fallbacks?: {
      document?: string;
      image?: string;
      audio?: string;
      video?: string;
      font?: string;
    };
    cacheOnFrontEndNav?: boolean;
    reloadOnOnline?: boolean;
    scope?: string;
    sw?: string;
    customWorkerDir?: string;
    customWorkerPrefix?: string;
    customWorkerSrc?: string;
    cacheStartUrl?: boolean;
    dynamicStartUrl?: boolean;
    dynamicStartUrlRedirect?: string;
  }

  export default function withPWA(config: PWAConfig): (nextConfig: NextConfig) => NextConfig;
}
