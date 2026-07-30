"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw, Music } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Redirect to home when back online
      setTimeout(() => router.push("/"), 1000);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router]);

  const handleRetry = () => {
    if (navigator.onLine) {
      router.push("/");
    } else {
      window.location.reload();
    }
  };

  const goToOfflineStorage = () => {
    router.push("/settings/storage");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-20 h-20 mx-auto rounded-full bg-surface-container flex items-center justify-center">
          <WifiOff size={40} className="text-on-surface-variant" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-on-surface">You're Offline</h1>
          <p className="text-on-surface-variant">
            Check your internet connection to browse and stream music.
          </p>
        </div>

        {isOnline ? (
          <div className="text-green-500 font-medium">
            Back online! Redirecting...
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={handleRetry} className="w-full gap-2">
              <RefreshCw size={18} />
              Try Again
            </Button>

            <Button
              onClick={goToOfflineStorage}
              variant="outline"
              className="w-full gap-2"
            >
              <Music size={18} />
              Play Downloaded Songs
            </Button>

            <p className="text-sm text-on-surface-variant">
              You can still play songs you've downloaded for offline listening.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
