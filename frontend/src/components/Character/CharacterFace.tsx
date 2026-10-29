import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LOOK } from "../../lib/character/bodies";
import { composeFace, FACE, type PartsData } from "../../lib/character/compose";
import { normalizeProfile } from "../../lib/character/profile";
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
 * The user's character's face where the bar had the user icon: as they made it, its colours, hair, glasses and ears,
 * never a hat (see bodies.ts). `className` sizes it like the icon; a body with no face drawn yet shows the icon
 * (`iconClass`), and while the faces load the place is kept empty. A red dot says something earned waits to be seen
 * on the character sheet.
 */
export function CharacterFace({ user, className, iconClass }: { user: User; className: string; iconClass: string }) {
  const data = useFacesData();
  const saved = useMemo(() => normalizeProfile(user.profile).look ?? DEFAULT_LOOK, [user.profile]);
  const look = useFaceLook(user, saved);
  const isNew = useSomethingNew(user);
  const pixels = data && composeFace(look, data);
  const face = !data ? (
    <span className={className} aria-hidden />
  ) : !pixels ? (
    <span className={iconClass} aria-hidden />
  ) : (
    <svg viewBox={`0 0 ${FACE} ${FACE}`} shapeRendering="crispEdges" className={className} aria-hidden data-character-face>
      {pixels.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.fill} />
      ))}
    </svg>
  );
  // A red dot, like the bell's: something earned waits on the user's page.
  return (
    <span className="relative flex-none">
      {face}
      {isNew && <span className="absolute -top-0.5 -right-1 size-1.5 bg-red-600 sm:size-2" title="Something new on your character" data-character-new aria-hidden />}
    </span>
  );
}
