import type { FeedbackKind } from "../types";
import { api } from "./client";

export const sendFeedback = (body: { kind: FeedbackKind; subject: string; message: string }) => api("/feedback", { body });
