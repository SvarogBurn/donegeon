import { createContext, useContext, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useBoxColor, useSetBoxColor } from "../../hooks/useAuth";
import { frameStyle, TONE_COLORS } from "../../lib/frameTones";
import { ColorSwatch } from "../ColorChoices";

/** What the grid lets a tile's frame do: be dragged by its tab button, and be pinned. */
export interface TileControls {
  /** For the buttons' labels: "Today", 'list "Chores"'. */
  name: string;
  isPinned: boolean;
  /** Absent where there is no band to pin to (the Calendar page). */
  onTogglePin?: () => void;
  /** Absent where the boxes keep their place: no tab button. */
  onDragStart?: (e: ReactPointerEvent<HTMLElement>) => void;
  /** What the tab button says it does, where that is not moving among the tiles of a grid. */
  dragTitle?: string;
  /** Minimizes the tile away (it can be brought back from the "Hidden" row under the grid); absent on tiles that can't be hidden. */
  onHide?: () => void;
  /**
   * The box's key among the user's picked box colours (useBoxColors): its frame takes the colour picked for it, and gets
   * a button to pick one. Absent on a box with a colour of its own (a list's).
   */
  colorKey?: string;
}

export const TileControlsContext = createContext<TileControls | null>(null);

interface Props extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Shown on the darker band of the border, at the left: plain text, or the list's editable name. */
  title: ReactNode;
  /** Extra buttons on the band, right of pin and tab (a list's delete button, at the far right). */
  actions?: ReactNode;
  /** The band's colour: what kind of box this is. Default is the border's own blue. */
  tone?: TileTone;
  /** A colour of the box's own instead of its tone's ("#rrggbb"): a stats box's. */
  color?: string;
}

/** blue: lists, Today, the deadline boxes. reward: reward lists. setup: goals, tags, new list. record: done. */
export type TileTone = "blue" | "reward" | "setup" | "record";

/** The colour the user picked for the box this is in (TileControls' colorKey), if any. */
export const usePickedColor = () => useBoxColor(useContext(TileControlsContext)?.colorKey);

/** The band's button for the box's colour: its own (`own`) until one is picked. */
function BoxColorButton({ colorKey, name, own, picked }: { colorKey: string; name: string; own: string; picked?: string }) {
  const setColor = useSetBoxColor();
  return (
    <ColorSwatch
      label={`Colour of ${name}`}
      title="Pick this box's colour"
      className="tile-button tile-button-color"
      align="right"
      current={picked ?? own}
      // The box's own colour is "no colour picked", so it follows its own again.
      onPick={(hex) => setColor(colorKey, hex === own ? null : hex)}
      reset={picked ? { label: "Back to its own colour", onReset: () => setColor(colorKey, null) } : undefined}
    />
  );
}

/**
 * The pixel-art border around a dashboard box. The title sits on the border's
 * darker band; on the same line at the right are the colour button, the pin button and the tab
 * button, which drags the tile, then the minimize button, then the tile's own
 * buttons (a list's delete). Sizes all follow --u (see index.css). Outside
 * the grid there is nothing to pin or drag, and the buttons are left out.
 */
export function TileFrame({ title, actions, tone = "blue", color, className = "", style, children, ...rest }: Props) {
  const controls = useContext(TileControlsContext);
  const picked = usePickedColor();
  // A picked colour recolours the band, as a list's does; without one the box keeps its own colour, or its tone's.
  const shown = picked ?? color;

  return (
    <section {...rest} data-tone={tone} style={shown ? { ...style, ...frameStyle(shown) } : style} className={`tile-frame tile-tone-${tone} ${className}`}>
      <div className="tile-band">
        <h2 className="tile-title">{title}</h2>
        {controls && (
          <>
            {controls.colorKey && (
              <BoxColorButton colorKey={controls.colorKey} name={controls.name} own={color ?? TONE_COLORS[tone]} picked={picked} />
            )}
            {controls.onTogglePin && (
              <button
                type="button"
                className="tile-button tile-button-pin"
                aria-pressed={controls.isPinned}
                aria-label={`${controls.isPinned ? "Unpin" : "Pin"} ${controls.name}`}
                title={controls.isPinned ? "Unpin: back into the columns" : "Pin to the top of the page"}
                onClick={controls.onTogglePin}
              />
            )}
            {controls.onDragStart && (
              <button
                type="button"
                className="tile-button tile-button-tab"
                onPointerDown={controls.onDragStart}
                aria-label={`Drag to move ${controls.name}`}
                title={controls.dragTitle ?? "Drag to move: above or below another tile, or into another column"}
              />
            )}
            {controls.onHide && (
              <button
                type="button"
                className="tile-button tile-button-min"
                aria-label={`Hide ${controls.name}`}
                title="Hide this box; bring it back from the Hidden row at the bottom of the page"
                onClick={controls.onHide}
              />
            )}
          </>
        )}
        {actions}
      </div>
      <div className="tile-body space-y-3">{children}</div>
    </section>
  );
}
