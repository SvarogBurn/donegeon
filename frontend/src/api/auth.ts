import type { User } from "../types";
import { api } from "./client";

type Credentials = { username: string; password: string };

export const getMe = () => api<{ user: User }>("/auth/me").then((r) => r.user);
export const signup = (body: Credentials) => api<{ user: User }>("/auth/signup", { body }).then((r) => r.user);
export const login = (body: Credentials) => api<{ user: User }>("/auth/login", { body }).then((r) => r.user);
export const logout = () => api("/auth/logout", { method: "POST" });
/** `confirm` is "donegeon/<username>", typed by the user. */
export const deleteMe = (confirm: string) => api("/auth/me", { method: "DELETE", body: { confirm } });
export const updateMe =(body: Partial<Pick<User, "tickedTasks" | "tutorialSeen" | "pointsCap" | "breakEvery">>) => api<{ user: User }>("/auth/me", { method: "PATCH", body }).then((r) => r.user);
