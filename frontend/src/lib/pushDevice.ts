import { removeDevice } from "../api/notifications";
import { isStandalone } from "./standalone";

/**
 * Where this device stands with push notifications: it can't take them ("unsupported"; an iPhone or iPad only in
 * the app added to the home screen: "install"), there is no service worker to show them ("noWorker": the dev server),
 * the browser was told no ("denied"), or it can and they are off or on.
 */
export type PushState = "unsupported" | "install" | "noWorker" | "denied" | "off" | "on";

/** What each state means to the user: under the switch in Settings, and under a task's reminder while push isn't on. */
export const PUSH_NOTES: Record<PushState, string> = {
  unsupported: "This browser can't show notifications from Donegeon. They still show in the bell.",
  install: "On an iPhone or iPad, notifications only come to Donegeon added to the home screen: Share › Add to Home Screen, then turn them on there.",
  noWorker: "Only the built app can show notifications (the dev server has no service worker). They still show in the bell.",
  denied: "Notifications are blocked for Donegeon in this browser. Allow them in the browser's site settings, then come back here.",
  off: "Off on this device: they only show in the bell. Turn them on here on each phone or computer that should get them.",
  on: "On for this device. Turn them on on your other devices too, if you like.",
};

const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** The service worker's registration, if the app has one (not in dev). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!("PushManager" in window) || !("Notification" in window)) return isApple() && !isStandalone() ? "install" : "unsupported";
  const worker = await registration();
  if (!worker) return "noWorker";
  if (Notification.permission === "denied") return "denied";
  return (await worker.pushManager.getSubscription()) && Notification.permission === "granted" ? "on" : "off";
}

/** The server's key, as the browser wants it. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Asks the browser (from a tap: it insists) and subscribes with the server's key. The subscription, or the state it stopped at. */
export async function subscribe(key: string): Promise<PushSubscription | PushState> {
  const worker = await registration();
  if (!worker) return "noWorker";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  return worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
}

/** Stops this device's notifications: on the server first (while still logged in), then in the browser. */
export async function unsubscribe() {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await removeDevice(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => false);
}
