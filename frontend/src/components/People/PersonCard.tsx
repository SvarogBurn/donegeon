import { useState } from "react";
import { CHEER_LINES } from "../../../../shared/constants";
import { useBlock, useRemoveFriend, useSendCheer } from "../../hooks/people";
import { bodyOf } from "../../lib/character/bodies";
import { normalizeLook } from "../../lib/character/profile";
import { rankOf } from "../../lib/character/titles";
import { localDate } from "../../lib/clock";
import { formatDay } from "../../lib/dates";
import { shownActivity, shownStats, type Person } from "../../lib/people";
import { ExpBar, Hearts } from "../Character/Bars";
import { CharacterSprite } from "../Character/CharacterSprite";

/** Cheering, and what can be done to a friend: under the card, on one row at a time. */
function CardButtons({ person }: { person: Person }) {
  const [asking, setAsking] = useState<"cheer" | "more" | "unfriend" | "block" | null>(null);
  const cheer = useSendCheer();
  const unfriend = useRemoveFriend();
  const block = useBlock();
  const { id, username } = person;

  if (asking === "cheer") {
    return (
      <div className="flex flex-col gap-1" data-cheer-lines>
        {CHEER_LINES.map((line) => (
          <button
            key={line}
            type="button"
            className="band-button justify-center"
            disabled={cheer.isPending}
            onClick={() => {
              cheer.mutate({ id, line });
              setAsking(null);
            }}
            data-cheer-line={line}
          >
            {line}
          </button>
        ))}
        <button type="button" className="btn-quiet text-xs" onClick={() => setAsking(null)}>
          Back
        </button>
      </div>
    );
  }
  if (asking === "more") {
    return (
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        <button type="button" className="btn-quiet underline" onClick={() => setAsking("unfriend")} data-unfriend>
          Unfriend
        </button>
        <button type="button" className="btn-quiet underline" onClick={() => setAsking("block")} data-block>
          Block
        </button>
        <button type="button" className="btn-quiet underline" onClick={() => setAsking(null)}>
          Back
        </button>
      </div>
    );
  }
  if (asking) {
    return (
      <div className="space-y-1 text-center text-xs">
        <p>{asking === "block" ? `Block ${username}? You won't see each other, and they can't ask to be friends.` : `Unfriend ${username}?`}</p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            className="btn-quiet underline"
            onClick={() => {
              (asking === "block" ? block : unfriend).mutate(id);
              setAsking(null);
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
    <div className="flex flex-wrap items-center justify-center gap-2">
      {person.canCheer && (
        <button type="button" className="band-button" disabled={person.hasCheered} title={person.hasCheered ? "You cheered them on today" : undefined} onClick={() => setAsking("cheer")} data-cheer>
          {person.hasCheered ? "Cheered" : "Cheer"}
        </button>
      )}
      <button type="button" className="btn-quiet px-1 text-xs" aria-label={`More for ${username}`} title="More" onClick={() => setAsking("more")} data-person-more>
        ⋯
      </button>
    </div>
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
      <h3 className="truncate text-center font-pixel text-xs" title={username}>
        {isYou ? "You" : username}
      </h3>
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
      {!isYou && <CardButtons person={person} />}
    </article>
  );
}
