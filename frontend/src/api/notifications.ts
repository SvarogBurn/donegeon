import type { Planned } from "../lib/notifySchedule";
import { api } from "./client";

/** The key a browser subscribes with; null when push isn't set up on the server. */
export const getPushKey = () => api<{ key: string | null }>("/notifications/key").then((r) => r.key);

/** This device turned on: what its browser gave (PushSubscription.toJSON()). */
export const addDevice = (subscription: PushSubscriptionJSON) => api("/notifications/subscriptions", { body: subscription });

export const removeDevice = (endpoint: string) => api("/notifications/subscriptions", { method: "DELETE", body: { endpoint } });

/** Everything planned, in place of what was planned before. */
export const saveSchedule = (items: Planned[]) => api("/notifications/schedule", { method: "PUT", body: { items } });

export const sendTestNotification = () => api("/notifications/test", { method: "POST" });
