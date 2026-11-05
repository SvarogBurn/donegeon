import { createContext, useContext, useEffect, useRef, useState, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useBoxColor, useBoxColorEdit, useSetBoxColor } from "../../hooks/useAuth";
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
  /** Folded to its band: only the band shows. */
  isCollapsed?: boolean;
  /** Folds the tile to its band, or opens it again: a click on the band that isn't on a button or field. Absent where it can't fold. */
  onToggleCollapse?: () => void;
  /**
   * The box's key among the user's picked box colours (useBoxColors): its frame takes the colour picked for it, and gets
   * a button to pick one (while the setting "Box colours" is on). Absent on a box with a colour of its own (a list's).
   */
  colorKey?: string;
}

export const TileControlsContext = createContext<TileControls | null>(null);

interface Props extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Shown on the darker band of the border, at the left: plain text, or the list's editable name. */
  title: ReactNode;
  /** Extra buttons on the band, at the far right (a note's close). */
  actions?: ReactNode;
  /** Extra rows in the band's ⋯ menu, under Pin, Colour and Hide (a list's colour, its delete). */
  menu?: ReactNode;
  /** The band's colour: what kind of box this is. Default is the border's own blue. */
  tone?: TileTone;
  /** A colour of the box's own instead of its tone's ("#rrggbb"): a stats box's. */
  color?: string;
}

/** blue: lists, Today, the deadline boxes. reward: reward lists. setup: goals, tags, new list. record: done. */
export type TileTone = "blue" | "reward" | "setup" | "record";

/** The colour the user picked for the box this is in (TileControls' colorKey), if any. */
export const usePickedColor = () => useBoxColor(useContext(TileControlsContext)?.colorKey);

/** The band menu's button for the box's colour: its own (`own`) until one is picked. */
function BoxColorButton({ colorKey, name, own, picked }: { colorKey: string; name: string; own: string; picked?: string }) {
  const setColor = useSetBoxColor();
  return (
    <ColorSwatch
      label={`Colour of ${name}`}
      title="Pick this box's colour"
      className="tile-button tile-button-color !mt-0"
      // At the left of the band's menu: its colours open rightwards, onto the screen, at every width.
      align="start"
      current={picked ?? own}
      // The box's own colour is "no colour picked", so it follows its own again.
      onPick={(hex) => setColor(colorKey, hex === own ? null : hex)}
      reset={picked ? { label: "Back to its own colour", onReset: () => setColor(colorKey, null) } : undefined}
    />
  );
}

/** A row of the band's ⋯ menu: a button with the words of what it does. */
export function BandMenuItem({ onClick, children, ...rest }: HTMLAttributes<HTMLButtonElement> & { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-stone-800 hover:bg-stone-200 disabled:opacity-50 dark:text-stone-200 dark:hover:bg-stone-800" onClick={onClick} {...rest}>
      {children}
    </button>
  );
}

/**
 * The band's ⋯ and what it opens: pin, colour and hide, and the box's own (`extra`), one place for what used to be a
 * row of small buttons on every box (2026-11-04, playtest 1). A click outside or Escape closes it, and so does a pick.
 */
function BandMenu({ controls, colorButton, extra }: { controls: TileControls; colorButton: ReactNode; extra?: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setIsOpen(false);
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);
  const picked = (then?: () => void) => () => {
    setIsOpen(false);
    then?.();
  };
  return (
    <span ref={ref} className="relative flex flex-none">
      <button
        type="button"
        className="tile-button tile-button-more"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`More for ${controls.name}`}
        title="Pin, hide, colour…"
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        // Its own colours: the band's white text isn't meant for it.
        <div className="card absolute top-full right-0 z-30 mt-1 w-56 !p-1 shadow-lg" role="menu" aria-label={`What to do with ${controls.name}`} data-band-menu onClick={(e) => (e.target as HTMLElement).closest("[role=menuitem]") && setIsOpen(false)}>
          {controls.onTogglePin && (
            <BandMenuItem onClick={picked(controls.onTogglePin)} aria-label={`${controls.isPinned ? "Unpin" : "Pin"} ${controls.name}`} data-band-pin>
              <span className="tile-button tile-button-pin !mt-0" aria-hidden />
              {controls.isPinned ? "Unpin: back into the columns" : "Pin to the top of the page"}
            </BandMenuItem>
          )}
          {colorButton && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-stone-800 dark:text-stone-200" data-band-color>
              {colorButton}
              Colour
            </div>
          )}
          {extra}
          {controls.onHide && (
            <BandMenuItem onClick={picked(controls.onHide)} aria-label={`Hide ${controls.name}`} data-band-hide>
              <span className="tile-button tile-button-min !mt-0" aria-hidden />
              Hide (it comes back from the Hidden row at the bottom)
            </BandMenuItem>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * The pixel-art border around a dashboard box. The title sits on the border's darker band; on the same line at the
 * right are the handle, which drags the tile, and a ⋯ that opens what else can be done with it: pin, colour, hide and
 * the box's own (a list's colour and delete). Then the tile's own buttons (a note's close). A click anywhere else on
 * the band folds the box to the band, and another opens it again. Sizes all follow --u (see index.css). Outside the
 * grid there is nothing to pin or drag, and the buttons are left out.
 */
export function TileFrame({ title, actions, menu, tone = "blue", color, className = "", style, children, ...rest }: Props) {
  const controls = useContext(TileControlsContext);
  const picked = usePickedColor();
  // The colour button only while the setting "Box colours" is on; off, the picked colours stay.
  const canPick = useBoxColorEdit();
  // A picked colour recolours the band, as a list's does; without one the box keeps its own colour, or its tone's.
  const shown = picked ?? color;
  const collapsed = Boolean(controls?.onToggleCollapse && controls.isCollapsed);
  // The band's buttons, tabs and fields (a list's name) do their own thing.
  const toggleCollapse = (e: ReactMouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label, [contenteditable], [role=menu]")) return;
    controls?.onToggleCollapse?.();
  };

  return (
    <section {...rest} data-tone={tone} style={shown ? { ...style, ...frameStyle(shown) } : style} className={`tile-frame tile-tone-${tone} ${collapsed ? "tile-collapsed" : ""} ${className}`} data-collapsed={collapsed || undefined}>
      <div
        className="tile-band"
        data-collapsible={controls?.onToggleCollapse ? "" : undefined}
        onClick={controls?.onToggleCollapse ? toggleCollapse : undefined}
      >
        <h2 className="tile-title">{title}</h2>
        {controls && (
          <>
            {controls.onDragStart && (
              <button
                type="button"
                className="tile-button tile-button-tab"
                onPointerDown={controls.onDragStart}
                aria-label={`Drag to move ${controls.name}`}
                title={controls.dragTitle ?? "Drag to move: above or below another tile, or into another column"}
              />
            )}
            {(controls.onTogglePin || controls.onHide || menu || (controls.colorKey && canPick)) && (
              <BandMenu
                controls={controls}
                colorButton={controls.colorKey && canPick && <BoxColorButton colorKey={controls.colorKey} name={controls.name} own={color ?? TONE_COLORS[tone]} picked={picked} />}
                extra={menu}
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
