// Notifications pushed by the server (backend/src/lib/push.ts), shown even with the app closed. Loaded into the
// service worker the build makes (importScripts in vite.config.ts), so it is plain script, not a module.

const ACTION_TITLES = { done: "Done" };
// The small icon Android shows at the left (white dragon on transparent: it draws only the shape). Ignored elsewhere.
const BADGE = "/notification-badge.png";
// The logo beside the words, on transparent. A PNG: Chrome (Android too) draws no SVG there, so favicon.svg showed nothing.
const ICON = "/notification-icon.png";

self.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data ? event.data.json() : null;
  } catch {
    message = null;
  }
  if (!message) return;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: message.icon || ICON,
      badge: BADGE,
      // A second one with the same tag (the plan sent again) takes the first one's place.
      tag: message.tag,
      // Done, where the device shows buttons (not on iPhones: a tap opens the page there). One sent before Snooze was
      // taken out may still ask for it: only the buttons there are now are shown.
      actions: (message.actions || []).filter((action) => ACTION_TITLES[action]).map((action) => ({ action, title: ACTION_TITLES[action] })),
      data: { url: message.url || "/", key: message.key, taskId: message.taskId, press: message.press },
    }),
  );
});

/** The user's day, as the app sends it: the server never decides the day itself. */
function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** A request to the API as the logged-in app makes it (the session cookie goes along: same origin). */
async function call(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Local-Date": localDay(), "X-Client-Time": new Date().toISOString() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const answer = await res.json().catch(() => null);
    throw new Error((answer && answer.error) || "Donegeon couldn't be reached");
  }
}

/** Opens `url`: in a Donegeon window already open if there is one, else in a new one. */
async function open(url) {
  const href = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const app = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (!app) return self.clients.openWindow(href);
  const focused = await app.focus();
  return focused && "navigate" in focused ? focused.navigate(href) : undefined;
}

self.addEventListener("notificationclick", (event) => {
  const { url, key, taskId, press } = event.notification.data || {};
  event.notification.close();
  if (event.action === "done" && taskId) {
    // Ticks the task, or presses it if it is done again and again. Refused (subtasks still open, logged out, no
    // connection): a notification says why, and a tap on it opens the task.
    const done = press ? call("POST", `/tasks/${taskId}/completions`, { fromNotification: true }) : call("PATCH", `/tasks/${taskId}/toggle`, { done: true, fromNotification: true });
    event.waitUntil(done.catch((err) => self.registration.showNotification("Not done", { body: err.message, icon: ICON, badge: BADGE, tag: `${key}:failed`, data: { url } })));
  } else {
    event.waitUntil(open(url || "/"));
  }
});
