import { usePublishCard } from "../../hooks/people";
import type { User } from "../../types";
import { useCardBasics } from "../Character/useUnlocks";

/** Keeps the character's level, look and streak up to date on the card others see, wherever the app is open. Shows nothing. */
export function CardPublisher({ user }: { user: User }) {
  usePublishCard("basics", useCardBasics(user));
  return null;
}
