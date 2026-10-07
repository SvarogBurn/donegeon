import type { FeedbackKind, FeedbackLetter } from "../types";
import { api } from "./client";

export const getFeedback = () => api<FeedbackLetter[]>("/feedback");

export const sendFeedback = (body: { kind: FeedbackKind; subject: string; message: string }) => api("/feedback", { body });
