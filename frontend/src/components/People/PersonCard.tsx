import { useState } from "react";
import { useBlock, useRemoveFriend, useSendCheer } from "../../hooks/people";
import { bodyOf } from "../../lib/character/bodies";
import { normalizeLook } from "../../lib/character/profile";
import { rankOf } from "../../lib/character/titles";
import { localDate } from "../../lib/clock";
import { formatDay } from "../../lib/dates";
import { shownActivity, shownStats, type Person } from "../../lib/people";
import { ExpBar, Hearts } from "../Character/Bars";
import { useFaceIcon } from "../Character/CharacterFace";
import { CharacterSprite } from "../Character/CharacterSprite";
import { CheerLines } from "./CheerLines";
import { Popup } from "./Popup";

/** What is in a friend's ⋯: a cheer, its lines in a dropdown, and what can be done to them, each asked first. */
function FriendMenu({ person, close }: { person: Person; close: () => void }) {
  const [isCheering, setIsCheering] = useState(false);
  const [asking, setAsking] = useState<"unfriend" | "block" | null>(null);
  const cheer = useSendCheer();
  const drawFace = useFaceIcon();
  const unfriend = useRemoveFriend();
  const block = useBlock();
  const { id, username } = person;

  if (asking) {
    return (
      <div className="space-y-1 text-xs">
        <p className="px-1.5">{asking === "block" ? `Block ${username}? You won't see each other, and they can't ask to be friends.` : `Unfriend ${username}?`}</p>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-quiet underline"
            onClick={() => {
              (asking === "block" ? block : unfriend).mutate(id);
              close();
            }}
            data-confirm={asking}
          >
            Yes
          </button>
          <button type="button" className="btn-quiet underline" onClick={() => setAsking(null)}>
            No
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {person.canCheer &&
        (person.hasCheered ? (
          <p className="px-1.5 py-1 text-xs text-stone-500" data-cheered>
            Cheered today
          </p>
        ) : (
          <>
            <button type="button" className="btn-quiet flex w-full items-center gap-1 text-left" aria-expanded={isCheering} onClick={() => setIsCheering(!isCheering)} data-cheer>
              {/* The subtasks' arrow: down while open, turned to point right while closed. */}
              <span className="task-arrow" style={isCheering ? undefined : { transform: "rotate(-90deg)" }} aria-hidden />
              Cheer
            </button>
            {isCheering && (
              <CheerLines
                onPick={(line) => {
                  cheer.mutate({ id, line, face: drawFace() });
                  close();
                }}
              />
            )}
          </>
        ))}
      <div className={person.canCheer ? "border-t-2 border-stone-300 pt-1 dark:border-stone-700" : undefined}>
        <button type="button" className="btn-quiet w-full text-left" onClick={() => setAsking("unfriend")} data-unfriend>
          Unfriend
        </button>
        <button type="button" className="btn-quiet w-full text-left" onClick={() => setAsking("block")} data-block>
          Block
        </button>
      </div>
    </>
  );
}

/**
 * One person in the carousel: only what they show and you show too (the server leaves the rest out). `isYou` is your
 * own card, so you see what your friends do. Someone whose app has published nothing yet is a new character. Small and
 * the same size on every screen: the stage sets its own --u, 3 screen pixels to an art pixel.
 */
export function PersonCard({ person, isYou = false }: { person: Person; isYou?: boolean }) {
  const { username, card } = person;
  const look = normalizeLook(card.look);
  const today = localDate();
  const activity = card.activity && shownActivity(card.activity, today);
  const stats = card.stats ? shownStats(card.stats.rows) : [];
  return (
    <article className="flex w-40 flex-none snap-center flex-col gap-2" data-person={username} aria-label={isYou ? "You" : username}>
      {/* The same height with or without the ⋯, so the characters stand in one line. */}
      <div className="flex h-8 items-center justify-center gap-1">
        <h3 className="min-w-0 truncate font-pixel text-xs" title={username}>
          {isYou ? "You" : username}
        </h3>
        {!isYou && (
          <Popup label={`Options for ${username}`} button="⋯" buttonClassName="btn-quiet glyph flex-none" name="person-more">
            {(close) => <FriendMenu person={person} close={close} />}
          </Popup>
        )}
      </div>
      <div className="character-stage w-full [--u:3px]" data-person-stage>
        <CharacterSprite look={look} scale={1} cover={bodyOf(look).toEdge} label={`${username}, the character`} />
      </div>
      {card.level === undefined ? (
        <p className="text-center text-xs text-stone-500" data-person-new>
          {isYou ? "Your card is on its way…" : "Hasn't been here yet"}
        </p>
      ) : (
        <>
          <p className="text-center text-xs text-stone-500" data-person-title>
            {card.title ?? rankOf(card.level)}
          </p>
          {/* Ten hearts, from Lv 11, wouldn't fit the card at the page's --u. */}
          {card.hearts && (
            <div className="[--u:2px]">
              <Hearts hp={card.hearts.hp} max={card.hearts.max} />
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <p className="font-pixel text-xs" data-person-level={card.level}>
              Lv. {card.level}
            </p>
            <ExpBar into={card.into ?? 0} span={card.span ?? 0} label={`Exp of ${username} to the next level`} />
          </div>
        </>
      )}
      {activity && (
        <p className="text-center text-xs" data-person-activity>
          {activity.lastHere ? (
            `Last here on ${formatDay(activity.lastHere)}`
          ) : (
            <>
              <span className="font-bold tabular-nums">{activity.streak}</span> day streak
            </>
          )}
          {" · "}
          <span className="font-bold tabular-nums">{activity.week}</span> this week
        </p>
      )}
      {stats.length > 0 && (
        <ul className="space-y-0.5" data-person-stats>
          {stats.map((stat) => (
            <li key={stat.key} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[10px] text-stone-500" title={stat.name}>
                {stat.name}
              </span>
              <span className="flex-none text-xs tabular-nums">
                <span className="font-bold">{stat.text ?? stat.value}</span>
                {stat.of !== undefined && <span className="text-stone-500"> / {stat.of}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {card.skills && card.skills.length > 0 && (
        <ul className="space-y-1" data-person-skills>
          {card.skills.map((skill) => (
            <li key={skill.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-xs">{skill.name}</span>
                <span className="flex-none font-pixel text-[10px]">Lv. {skill.level}</span>
              </div>
              <ExpBar into={skill.into} span={skill.span} color={skill.color} label={`Exp of ${skill.name} to its next level`} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
