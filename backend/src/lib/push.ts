import webpush, { WebPushError } from "web-push";

/**
 * Web Push, signed with this server's VAPID keys (`npx web-push generate-vapid-keys`). Without them nothing is pushed,
 * and the app's settings say notifications aren't set up on this server.
 */
const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
// Who the push services may write to about this server's pushes.
const subject = process.env.VAPID_SUBJECT ?? "mailto:donegeon@example.com";

const enabled = publicKey !== "" && privateKey !== "";
if (enabled) webpush.setVapidDetails(subject, publicKey, privateKey);

/** The key a browser subscribes with; null when push isn't set up. */
export const vapidPublicKey = () => (enabled ? publicKey : null);

export interface PushDevice {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the service worker shows (frontend/public/push-sw.js). */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** A second message with the same tag replaces the first on the device instead of piling up. */
  tag: string;
  /** The planned row's key, for its Snooze. */
  key?: string;
  /** The buttons under it, where the device shows them (not on iPhones). */
  actions?: ("done" | "snooze")[];
  /** The task its Done ticks, or presses (`press`). */
  taskId?: string;
  press?: boolean;
}

/** How long a push service keeps trying a phone that is off: a morning message is no use by the evening. */
const KEEP_TRYING_S = 6 * 60 * 60;

/**
 * Pushes one message to one device. "gone" means the browser has dropped the subscription (notifications turned off
 * there, the app uninstalled): it won't take pushes again and can be forgotten.
 */
export async function pushTo(device: PushDevice, message: PushMessage): Promise<"sent" | "gone" | "failed"> {
  if (!enabled) return "failed";
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(message), {
      TTL: KEEP_TRYING_S,
    });
    return "sent";
  } catch (err) {
    if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) return "gone";
    console.error("Pushing a notification failed:", err);
    return "failed";
  }
}
