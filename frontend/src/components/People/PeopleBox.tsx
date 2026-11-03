import { useState, type FormEvent } from "react";
import type { Named } from "../../api/people";
import { useAcceptFriend, useAskFriend, useCheerEveryone, useFriends, useIgnoreFriend, useInbox, useRemoveFriend } from "../../hooks/people";
import { useMe } from "../../hooks/useAuth";
import { USER_BOX_COLORS } from "../../lib/frameTones";
import { useFaceIcon } from "../Character/CharacterFace";
import { NeedsConnection } from "../NeedsConnection";
import { TileFrame } from "../Tiles/TileFrame";
import type { Person } from "../../lib/people";
import { Carousel } from "./Carousel";
import { CheerLines } from "./CheerLines";
import { PersonCard } from "./PersonCard";
import { Popup } from "./Popup";

/** Asks someone to be friends by their username, typed exactly: there is no search, so you can only add who you know. */
function AddFriend({ waiting }: { waiting: Named[] }) {
  const [username, setUsername] = useState("");
  const ask = useAskFriend();
  // Once they have said yes, "Asked" is over.
  const isWaiting = waiting.some((person) => person.username === ask.variables?.toLowerCase());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || ask.isPending) return;
    ask.mutate(username.trim(), { onSuccess: () => setUsername("") });
  };
  return (
    <form onSubmit={submit} className="space-y-1" data-add-friend-form>
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Their username"
          aria-label="Add a friend by their username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={32}
          data-add-friend-name
        />
        <button type="submit" className="band-button" disabled={!username.trim() || ask.isPending}>
          Add
        </button>
      </div>
      <p className="text-xs text-stone-500" role="status" data-add-friend-answer>
        {ask.error ? <span className="text-red-600 dark:text-red-400">{ask.error.message}</span> : ask.data?.status === "friends" ? "You're friends now." : isWaiting ? "Asked. You'll see their card once they say yes." : "Add someone you know by their username"}
      </p>
    </form>
  );
}

/** Asking you, and your own that wait for an answer. */
function Requests({ asking, waiting }: { asking: Named[]; waiting: Named[] }) {
  const accept = useAcceptFriend();
  const ignore = useIgnoreFriend();
  const remove = useRemoveFriend();
  return (
    <>
      {asking.length > 0 && (
        <ul className="space-y-1" data-friend-requests>
          {asking.map(({ id, username }) => (
            <li key={id} className="flex flex-wrap items-center gap-2 text-xs" data-friend-request={username}>
              <span className="min-w-0 flex-1 truncate">{username} wants to be friends</span>
              <button type="button" className="band-button" onClick={() => accept.mutate(id)} data-accept-friend>
                Accept
              </button>
              <button type="button" className="btn-quiet underline" onClick={() => ignore.mutate(id)} data-ignore-friend>
                Ignore
              </button>
            </li>
          ))}
        </ul>
      )}
      {waiting.length > 0 && (
        <ul className="space-y-1" data-friend-waiting>
          {waiting.map(({ id, username }) => (
            <li key={id} className="flex items-center gap-2 text-xs text-stone-500">
              <span className="min-w-0 flex-1 truncate">Waiting for {username}</span>
              <button type="button" className="btn-quiet underline" onClick={() => remove.mutate(id)} data-cancel-friend>
                Take back
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * One cheer to every friend, under the carousel, leaving out whoever you cheered today. Only with two friends or more
 * to cheer: with one it would be their ⋯ again.
 */
function CheerEveryone({ friends }: { friends: Person[] }) {
  const cheer = useCheerEveryone();
  const drawFace = useFaceIcon();
  const cheerable = friends.filter((friend) => friend.canCheer);
  if (cheerable.length < 2) return null;
  return (
    <div className="flex justify-center">
      {cheerable.every((friend) => friend.hasCheered) ? (
        <p className="text-xs text-stone-500" data-cheered-everyone>
          Everyone cheered today
        </p>
      ) : (
        <Popup label="Cheer everyone" button="Cheer everyone" buttonClassName="btn-quiet flex items-center gap-1" arrow name="cheer-everyone">
          {(close) => (
            <CheerLines
              onPick={(line) => {
                cheer.mutate({ line, face: drawFace() });
                close();
              }}
            />
          )}
        </Popup>
      )}
    </div>
  );
}

/**
 * Your friends' characters, side by side, your own first so you see what they see. Empty until you have a friend: only
 * the way to add one. Friends are people you added by their exact username and who said yes. Nothing here counts
 * anyone. Set to Off, you see nobody.
 */
export function PeopleBox() {
  const { user } = useMe();
  const isOff = user?.peopleOff === true;
  const { data, error } = useFriends(!isOff);
  const inbox = useInbox(!isOff, true);
  return (
    <TileFrame title="Friends" aria-label="Friends" color={USER_BOX_COLORS.people} data-people>
      {isOff ? (
        <p className="text-xs text-stone-500" data-people-off>
          People is off: you see nobody and nobody sees you. Settings › Social changes that.
        </p>
      ) : !data?.me ? (
        <p className="text-xs text-stone-500">{error?.message ?? "Loading…"}</p>
      ) : (
        <NeedsConnection>
          {/* The fieldset around it is no box of its own, so the spacing is this one's. */}
          <div className="space-y-3">
            {data.friends.length > 0 ? (
              <Carousel label="You and your friends">
                <PersonCard person={data.me} isYou />
                {data.friends.map((person) => (
                  <PersonCard key={person.id} person={person} />
                ))}
              </Carousel>
            ) : (
              <p className="text-center text-xs text-stone-500" data-people-empty>
                No friends here yet.
              </p>
            )}
            <CheerEveryone friends={data.friends} />
            <Requests asking={inbox.data?.requests ?? []} waiting={data.sent} />
            <AddFriend waiting={data.sent} />
          </div>
        </NeedsConnection>
      )}
    </TileFrame>
  );
}
