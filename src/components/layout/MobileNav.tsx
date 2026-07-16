"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/search", icon: "explore", label: "Explore" },
  { href: "/library", icon: "library_music", label: "Library" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 pb-safe bg-surface-container border-t border-outline-variant shadow-lg">
      {navItems.map(({ href, icon, label }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center active:bg-surface-container-highest active:scale-95 duration-150 p-2 rounded-lg w-16",
              isActive ? "text-primary" : "text-on-surface-variant"
            )}
          >
            <span
              className="material-symbols-outlined"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {icon}
            </span>
            <span className={cn("mt-1 text-[10px]", isActive && "font-bold")}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
