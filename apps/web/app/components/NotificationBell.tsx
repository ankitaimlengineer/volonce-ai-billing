"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authGet, authPost } from "@/lib/api";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

interface NotificationSummary {
  unread_count: number;
  items: NotificationItem[];
}

export default function NotificationBell() {
  const [data, setData] = useState<NotificationSummary | null>(null);
  const [open, setOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await authGet<NotificationSummary>("/api/v1/notifications");
      setData(res);
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchNotifs = async () => {
      try {
        const res = await authGet<NotificationSummary>("/api/v1/notifications");
        if (isMounted) {
          setData(res);
        }
      } catch {
        // Ignored
      }
    };

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000); // દર ૧ મિનિટે ઓટો-ચેક

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await authPost("/api/v1/notifications/read-all");
      await loadNotifications();
    } catch {
      // Ignored
    }
  };

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        await authPost(`/api/v1/notifications/${notif.id}/read`);
        await loadNotifications();
      } catch {
        // Ignored
      }
    }
  };

  const unread = data?.unread_count || 0;

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-white text-lg shadow-sm hover:bg-emerald-50 transition"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-gray-900">એલર્ટ્સ & સૂચનાઓ</span>
              {unread > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700">
                  {unread} નવા
                </span>
              )}
            </div>

            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold text-emerald-700 hover:underline"
              >
                બધા વંચાઈ ગયા ✓
              </button>
            )}
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
            {!data || data.items.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-400">કોઈ નવી સૂચના નથી.</p>
            ) : (
              data.items.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`rounded-xl p-3 border transition cursor-pointer ${
                    n.is_read
                      ? "bg-gray-50/50 border-gray-100 opacity-70"
                      : n.severity === "critical"
                      ? "bg-red-50 border-red-200"
                      : "bg-emerald-50/40 border-emerald-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-black text-gray-900">{n.title}</p>
                    <span className="text-[10px] text-gray-400 font-medium">
                      {new Date(n.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{n.message}</p>
                  {n.link && (
                    <Link
                      href={n.link}
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-block text-[11px] font-bold text-emerald-800 hover:underline"
                    >
                      વિગત જુઓ →
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}