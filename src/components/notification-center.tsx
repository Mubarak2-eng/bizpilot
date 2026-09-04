"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import Link from "next/link";
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  NotificationItem,
} from "@/lib/actions/notifications";

interface NotificationCenterProps {
  businessId: string;
}

export default function NotificationCenter({ businessId }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    const res = await getNotificationsAction(businessId);
    if (res.success) {
      setUnreadCount(res.unreadCount);
      setNotifications(res.notifications);
    }
  };

  useEffect(() => {
    loadNotifications();
    // Poll every 30 seconds for live updates
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [businessId]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      const res = await markNotificationReadAction(businessId, id);
      if (res.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const res = await markAllNotificationsReadAction(businessId);
      if (res.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    });
  };

  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        aria-label="View notifications and inventory alerts"
        className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/[0.08] transition cursor-pointer flex items-center justify-center shadow-xs"
      >
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center shadow-lg shadow-rose-500/50 animate-pulse font-mono">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Notification Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#090d24] border border-slate-200 dark:border-white/[0.12] shadow-2xl backdrop-blur-2xl z-50 overflow-hidden">
          {/* Panel Header */}
          <div className="p-3.5 bg-slate-50 dark:bg-[#060918]/90 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">Alerts & Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-mono">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-[10px] text-cyan-600 dark:text-cyan-300 hover:text-cyan-700 dark:hover:text-cyan-200 font-semibold transition cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
            {notifications.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-base">
                  ✓
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">All Caught Up</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Inventory levels are healthy across your catalog.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 transition-colors flex items-start justify-between gap-3 ${
                    item.read
                      ? "bg-transparent opacity-80 hover:opacity-100"
                      : "bg-violet-50/70 dark:bg-violet-950/20 hover:bg-violet-100/70 dark:hover:bg-violet-950/30"
                  }`}
                >
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-xs text-rose-700 dark:text-rose-300 shrink-0 mt-0.5">
                      ⚠️
                    </div>

                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300">
                          Low Stock
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">{item.title}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{item.message}</p>

                      {item.productName && (
                        <div className="pt-1 flex items-center gap-2 text-[10px]">
                          <Link
                            href="/products"
                            onClick={() => setIsOpen(false)}
                            className="text-cyan-600 dark:text-cyan-300 hover:text-cyan-700 dark:hover:text-cyan-200 font-bold underline"
                          >
                            Restock in Products →
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  {!item.read && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkRead(item.id, e)}
                      title="Mark as read"
                      aria-label="Mark notification as read"
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer shrink-0"
                    >
                      <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 block" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Panel Footer */}
          <div className="p-2.5 bg-slate-50 dark:bg-[#060918]/90 border-t border-slate-200 dark:border-white/[0.08] text-center">
            <Link
              href="/products"
              onClick={() => setIsOpen(false)}
              className="text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition block"
            >
              View Full Product Inventory →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
