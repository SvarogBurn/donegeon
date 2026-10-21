import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LOOK } from "../../lib/character/bodies";
import { composeFace, FACE, type PartsData } from "../../lib/character/compose";
import { normalizeProfile } from "../../lib/character/profile";
import type { User } from "../../types";

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
 * (`iconClass`), and while the faces load the place is kept empty.
 */
export function CharacterFace({ user, className, iconClass }: { user: User; className: string; iconClass: string }) {
  const data = useFacesData();
  const look = useMemo(() => normalizeProfile(user.profile).look ?? DEFAULT_LOOK, [user.profile]);
  if (!data) return <span className={className} aria-hidden />;
  const pixels = composeFace(look, data);
  if (!pixels) return <span className={iconClass} aria-hidden />;
  return (
    <svg viewBox={`0 0 ${FACE} ${FACE}`} shapeRendering="crispEdges" className={className} aria-hidden data-character-face>
      {pixels.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.fill} />
      ))}
    </svg>
  );
}
