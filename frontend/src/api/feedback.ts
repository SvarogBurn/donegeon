import type { FeedbackKind, FeedbackLetter } from "../types";
import { api } from "./client";

export const getFeedback = () => api<FeedbackLetter[]>("/feedback");

/** How many letters this account has sent, for its character's exp. */
export const getFeedbackSent = () => api<{ count: number }>("/feedback/sent");

export const sendFeedback = (body: { kind: FeedbackKind; subject: string; message: string }) => api("/feedback", { body });
