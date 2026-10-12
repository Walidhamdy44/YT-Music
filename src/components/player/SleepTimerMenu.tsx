"use client";

import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Clock3, X } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { formatTime } from "@/lib/utils";

export function SleepTimerMenu() {
  const endsAt = usePlayerStore((state) => state.sleepTimerEndsAt);
  const setSleepTimer = usePlayerStore((state) => state.setSleepTimer);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (endsAt == null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [endsAt]);
  const remaining = endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));

  return (
    <Menu.Root>
      <Menu.Trigger aria-label={endsAt == null ? "Sleep timer" : `Sleep timer: ${formatTime(remaining)} remaining`} className={`flex size-11 flex-col items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-primary ${endsAt == null ? "text-on-surface-variant" : "text-primary"}`}>
        <Clock3 size={endsAt == null ? 22 : 18} aria-hidden="true" />
        {endsAt != null && <span className="text-[10px] font-semibold tabular-nums">{Math.ceil(remaining / 60)}m</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" side="bottom" sideOffset={8} className="z-[160] outline-none">
          <Menu.Popup data-sleep-timer-menu className="w-60 rounded-xl bg-surface-container-high p-2 text-on-surface shadow-xl outline-none">
            <Menu.Group>
              <Menu.GroupLabel className="px-3 pb-1 pt-2 text-base font-semibold">Sleep timer</Menu.GroupLabel>
              <p className="px-3 pb-3 text-sm text-on-surface-variant">{endsAt == null ? "Pause music after" : `Music pauses in ${formatTime(remaining)}`}</p>
              {[15, 30, 45, 60].map((minutes) => (
                <Menu.Item key={minutes} onClick={() => { setNow(Date.now()); setSleepTimer(minutes); }} className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm outline-none data-highlighted:bg-surface-container-highest">
                  {minutes} minutes
                </Menu.Item>
              ))}
              {endsAt != null && (
                <Menu.Item onClick={() => setSleepTimer(null)} className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm text-primary outline-none data-highlighted:bg-surface-container-highest">
                  <X size={16} aria-hidden="true" /> Cancel timer
                </Menu.Item>
              )}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
