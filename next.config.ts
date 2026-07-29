import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/lh3\.googleusercontent\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-user-images",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.ytimg\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "youtube-thumbnails",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.ggpht\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "ggpht-images",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["youtubei.js"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "*.ggpht.com",
      },
    ],
  },
};

export default withPWA(nextConfig);
