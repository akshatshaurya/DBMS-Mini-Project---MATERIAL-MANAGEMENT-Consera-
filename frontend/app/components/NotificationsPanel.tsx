
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Notification = {
  _id: string;
  user_id: number;
  notification_type: string;
  message: string;
  reference_id?: number;
  is_read: boolean;
  created_at: string;
};

const typeStyles: Record<string, string> = {
  RESERVATION_REQUESTED: "bg-amber-50 text-amber-700",
  RESERVATION_APPROVED: "bg-emerald-50 text-emerald-700",
  RESERVATION_REJECTED: "bg-red-50 text-red-700",
  TRANSFER_DISPATCHED: "bg-blue-50 text-blue-700",
  TRANSFER_DELIVERED: "bg-emerald-50 text-emerald-700",
  MATERIAL_INSPECTED: "bg-violet-50 text-violet-700",
};

const USER_ID = 4;

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [listResponse, countResponse] = await Promise.all([
        fetch(`/api/notifications?user_id=${USER_ID}`, {
          cache: "no-store",
        }),
        fetch(`/api/notifications/unread?user_id=${USER_ID}`, {
          cache: "no-store",
        }),
      ]);

      const [listData, countData] = await Promise.all([
        listResponse.json(),
        countResponse.json(),
      ]);

      if (!listResponse.ok || !listData.success) {
        throw new Error(listData.message || "Unable to load notifications");
      }

      if (!countResponse.ok || !countData.success) {
        throw new Error(countData.message || "Unable to load unread count");
      }

      setNotifications(listData.notifications);
      setUnreadCount(countData.unread_count);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notifications"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const visibleNotifications = useMemo(() => {
    if (filter === "UNREAD") {
      return notifications.filter((item) => !item.is_read);
    }

    if (filter === "READ") {
      return notifications.filter((item) => item.is_read);
    }

    return notifications;
  }, [notifications, filter]);

  async function toggleRead(item: Notification) {
    try {
      setUpdatingId(item._id);
      setError("");
      setMessage("");

      const response = await fetch(`/api/notifications/${item._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_read: !item.is_read,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update notification");
      }

      setMessage(
        item.is_read
          ? "Notification marked as unread."
          : "Notification marked as read."
      );

      await loadNotifications();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update notification"
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((item) => !item.is_read);

    if (unread.length === 0) return;

    try {
      setError("");
      setMessage("");

      const results = await Promise.all(
        unread.map((item) =>
          fetch(`/api/notifications/${item._id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ is_read: true }),
          })
        )
      );

      const failed = results.find((response) => !response.ok);

      if (failed) {
        throw new Error("Some notifications could not be updated.");
      }

      setMessage("All notifications marked as read.");
      await loadNotifications();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update notifications"
      );
    }
  }

  const readCount = notifications.length - unreadCount;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-bold">Notifications</h3>
          <p className="mt-1 text-sm text-slate-500">
            Stay updated on reservations, transfers and inspections.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadNotifications}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            ⟳
          </button>

          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Summary label="Total Notifications" value={notifications.length} />
        <Summary label="Unread" value={unreadCount} />
        <Summary label="Read" value={readCount} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h4 className="font-bold">Notification Centre</h4>
            <p className="mt-1 text-xs text-slate-400">
              Your latest system updates.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["ALL", "All"],
              ["UNREAD", "Unread"],
              ["READ", "Read"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  filter === value
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Loading notifications...
          </p>
        ) : visibleNotifications.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-3xl">♧</div>
            <p className="mt-3 font-semibold">No notifications found</p>
            <p className="mt-1 text-sm text-slate-400">
              {filter === "UNREAD"
                ? "You're all caught up."
                : "There are no notifications in this category."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleNotifications.map((item) => (
              <article
                key={item._id}
                className={`flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-start ${
                  !item.is_read ? "bg-blue-50/30" : ""
                }`}
              >
                <div className="flex min-w-0 gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg text-blue-600">
                    {item.notification_type.startsWith("TRANSFER")
                      ? "↗"
                      : item.notification_type.startsWith("RESERVATION")
                        ? "⇄"
                        : "✓"}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${typeStyles[item.notification_type] || "bg-slate-100 text-slate-600"}`}
                      >
                        {item.notification_type.replaceAll("_", " ")}
                      </span>

                      {!item.is_read && (
                        <span className="h-2 w-2 rounded-full bg-blue-600" />
                      )}
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {item.message}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>
                        {new Date(item.created_at).toLocaleString()}
                      </span>

                      {item.reference_id !== undefined && (
                        <span>Reference #{item.reference_id}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => toggleRead(item)}
                  disabled={updatingId === item._id}
                  className="shrink-0 text-left text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50 sm:text-right"
                >
                  {updatingId === item._id
                    ? "Updating..."
                    : item.is_read
                      ? "Mark unread"
                      : "Mark as read"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}
