import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LOOK } from "../../lib/character/bodies";
import type { Look } from "../../lib/character/bodies";
import { composeFace, FACE, type PartsData } from "../../lib/character/compose";
import { faceIcon } from "../../lib/character/faceIcon";
import { normalizeProfile } from "../../lib/character/profile";
import { useMe } from "../../hooks/useAuth";
import type { User } from "../../types";
import { useFaceLook, useSomethingNew } from "./useUnlocks";

// The faces are loaded with the bar that shows one, apart from the bodies' parts (only loaded where a character is shown).
let loaded: PartsData | null = null;
let loading: Promise<PartsData> | null = null;

function useFacesData() {
  const [data, setData] = useState(loaded);
  useEffect(() => {
    if (data) return;
    loading ??= import("../../lib/character/faces.data.json").then((m) => (loaded = m.default as unknown as PartsData));
    let live = true;
    void loading.then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [data]);
  return data;
}

/**
 * A look's face: as made, its colours, hair, glasses and ears, never a hat (see bodies.ts). `className` sizes it; a body
 * with no face drawn yet shows the icon (`iconClass`), and while the faces load the place is kept empty.
 */
export function FaceSprite({ look, className, iconClass }: { look: Look; className: string; iconClass: string }) {
  const data = useFacesData();
  const pixels = data && composeFace(look, data);
  if (!data) return <span className={className} aria-hidden />;
  if (!pixels) return <span className={iconClass} aria-hidden />;
  return (
    <svg viewBox={`0 0 ${FACE} ${FACE}`} shapeRendering="crispEdges" className={className} aria-hidden data-character-face>
      {pixels.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.fill} />
      ))}
    </svg>
  );
}

/** Draws the user's own face for a push to carry, the one the task bar shows, when asked: undefined if there is none yet. */
export function useFaceIcon() {
  const { user } = useMe();
  const data = useFacesData();
  const saved = useMemo(() => normalizeProfile(user?.profile).look ?? DEFAULT_LOOK, [user?.profile]);
  const look = useFaceLook(user, saved);
  return () => {
    const pixels = data && composeFace(look, data);
    return pixels ? faceIcon(pixels) : undefined;
  };
}

/** The user's character's face where the bar had the user icon. A red dot says something earned waits to be seen on the character sheet. */
export function CharacterFace({ user, className, iconClass }: { user: User; className: string; iconClass: string }) {
  const saved = useMemo(() => normalizeProfile(user.profile).look ?? DEFAULT_LOOK, [user.profile]);
  const look = useFaceLook(user, saved);
  const isNew = useSomethingNew(user);
  // A red dot, like the bell's: something earned waits on the user's page.
  return (
    <span className="relative flex-none">
      <FaceSprite look={look} className={className} iconClass={iconClass} />
      {isNew && <span className="absolute -top-0.5 -right-1 size-1.5 bg-red-600 sm:size-2" title="Something new on your character" data-character-new aria-hidden />}
    </span>
  );
}
