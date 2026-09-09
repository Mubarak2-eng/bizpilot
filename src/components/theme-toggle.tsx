"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/theme-provider";

const emptySubscribe = () => () => {};

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!isMounted) {
    return (
      <div
        className="w-8 h-8 rounded-xl bg-slate-200/50 dark:bg-white/[0.06] border border-slate-300 dark:border-white/[0.08] animate-pulse"
        aria-hidden="true"
      />
    );
  }

  const cycleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  const getLabel = () => {
    if (theme === "system") return `System (${resolvedTheme})`;
    if (theme === "dark") return "Dark Mode";
    return "Light Mode";
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={cycleTheme}
        aria-label={`Current theme: ${getLabel()}. Click to switch theme.`}
        title={`Theme: ${getLabel()} (Click to toggle)`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-all cursor-pointer shadow-xs"
      >
        {theme === "light" && (
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        )}

        {theme === "dark" && (
          <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        )}

        {theme === "system" && (
          <svg className="w-4 h-4 text-cyan-500 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        )}

        <span className="text-[11px] font-medium capitalize hidden sm:inline-block">
          {theme}
        </span>
      </button>
    </div>
  );
}
