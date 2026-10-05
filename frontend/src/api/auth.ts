import type { TickedTasks, User } from "../types";
import { api } from "./client";

type Credentials = { username: string; password: string };

export const getMe = () => api<{ user: User }>("/auth/me").then((r) => r.user);
export const signup = (body: Credentials) => api<{ user: User }>("/auth/signup", { body }).then((r) => r.user);
export const login = (body: Credentials) => api<{ user: User }>("/auth/login", { body }).then((r) => r.user);
export const logout = () => api("/auth/logout", { method: "POST" });
export const updateMe = (body: { tickedTasks: TickedTasks }) => api<{ user: User }>("/auth/me", { method: "PATCH", body }).then((r) => r.user);
