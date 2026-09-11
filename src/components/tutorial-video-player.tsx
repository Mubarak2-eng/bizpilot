"use client";

import { useState } from "react";

interface TutorialVideoPlayerProps {
  videoUrl?: string; // YouTube, Loom, Vimeo, or direct MP4 URL
  title?: string;
  subtitle?: string;
}

export default function TutorialVideoPlayer({
  videoUrl = "https://www.youtube.com/embed/dQw4w9WgXcQ",
  title = "Run Your Entire Business on WhatsApp Autopilot",
  subtitle = "Watch this 2-minute walkthrough to see how BizPilot AI automates your sales, stock, and debtor recovery in real-time.",
}: TutorialVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Parse embeddable URL format for YouTube / Vimeo / Loom
  const getEmbedUrl = (url: string) => {
    if (!url) return "";
    if (url.includes("youtube.com/watch?v=")) {
      const videoId = url.split("v=")[1]?.split("&")[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
    if (url.includes("youtu.be/")) {
      const videoId = url.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
    if (url.includes("loom.com/share/")) {
      const videoId = url.split("loom.com/share/")[1]?.split("?")[0];
      return `https://www.loom.com/embed/${videoId}?autoplay=1`;
    }
    if (url.includes("vimeo.com/") && !url.includes("player.vimeo.com")) {
      const videoId = url.split("vimeo.com/")[1]?.split("?")[0];
      return `https://player.vimeo.com/video/${videoId}?autoplay=1`;
    }
    return url;
  };

  const embedUrl = getEmbedUrl(videoUrl);
  const isDirectVideoFile = videoUrl.endsWith(".mp4") || videoUrl.endsWith(".webm");

  return (
    <div className="w-full max-w-xl mx-auto lg:mx-0 flex flex-col justify-center space-y-6 text-slate-900 dark:text-white">
      {/* Title & Value Prop Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-xs font-bold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Quick 2-Minute Demo
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* 16:9 Video Player Frame */}
      <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-slate-200 dark:border-violet-500/30 bg-slate-900 shadow-2xl shadow-violet-950/40 group">
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500 pointer-events-none" />

        {isPlaying ? (
          isDirectVideoFile ? (
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full h-full object-cover relative z-10"
            />
          ) : (
            <iframe
              src={embedUrl}
              title="BizPilot AI Tutorial"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full relative z-10 border-0"
            />
          )
        ) : (
          <div
            onClick={() => setIsPlaying(true)}
            className="w-full h-full bg-gradient-to-br from-[#0c102a] via-[#080b1d] to-[#040612] flex flex-col items-center justify-center p-6 relative cursor-pointer z-10 select-none group/thumb"
          >
            <div className="absolute inset-0 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />

            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[2px] shadow-lg shadow-indigo-600/40 group-hover/thumb:scale-110 transition-transform duration-300 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950/90 rounded-full flex items-center justify-center pl-1">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-400 fill-current"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>

            <div className="mt-4 text-center">
              <span className="text-xs sm:text-sm font-bold text-white tracking-wide block">
                Click to Watch Walkthrough
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Duration: 2 mins • Audio included
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="p-3.5 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] backdrop-blur-md">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">WhatsApp Sales</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            Record sales & expenses via voice or text.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] backdrop-blur-md">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">Auto Stock Sync</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            Instant alerts before inventory runs out.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] backdrop-blur-md">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">Debtor Recovery</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            Automated payment reminders & tracking.
          </p>
        </div>
      </div>
    </div>
  );
}
