import { createContext, useContext, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** What the grid lets a tile's frame do: be dragged by its tab button, and be pinned. */
export interface TileControls {
  /** For the buttons' labels: "Today", 'list "Chores"'. */
  name: string;
  isPinned: boolean;
  onTogglePin: () => void;
  onDragStart: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Minimizes the tile away (it can be brought back from the dashboard's "Hidden" row); absent on tiles that can't be hidden. */
  onHide?: () => void;
}

export const TileControlsContext = createContext<TileControls | null>(null);

interface Props extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Shown on the darker band of the border, at the left: plain text, or the list's editable name. */
  title: ReactNode;
  /** Extra buttons on the band, right of pin and tab (a list's delete button, at the far right). */
  actions?: ReactNode;
  /** The band's colour: what kind of box this is. Default is the border's own blue. */
  tone?: TileTone;
}

/** blue: lists, Today, the deadline boxes. reward: reward lists. setup: goals, tags, new list. record: done. */
export type TileTone = "blue" | "reward" | "setup" | "record";

/**
 * The pixel-art border around a dashboard box. The title sits on the border's
 * darker band; on the same line at the right are the pin button and the tab
 * button, which drags the tile, and on tiles that can be hidden the minimize
 * button. Sizes all follow --u (see index.css). Outside
 * the grid there is nothing to pin or drag, and the buttons are left out.
 */
export function TileFrame({ title, actions, tone = "blue", className = "", children, ...rest }: Props) {
  const controls = useContext(TileControlsContext);

  return (
    <section {...rest} data-tone={tone} className={`tile-frame tile-tone-${tone} ${className}`}>
      <div className="tile-band">
        <h2 className="tile-title">{title}</h2>
        {controls && (
          <>
            <button
              type="button"
              className="tile-button tile-button-pin"
              aria-pressed={controls.isPinned}
              aria-label={`${controls.isPinned ? "Unpin" : "Pin"} ${controls.name}`}
              title={controls.isPinned ? "Unpin: back into the columns" : "Pin to the top of the page"}
              onClick={controls.onTogglePin}
            />
            <button
              type="button"
              className="tile-button tile-button-tab"
              onPointerDown={controls.onDragStart}
              aria-label={`Drag to move ${controls.name}`}
              title="Drag to move: above or below another tile, or into another column"
            />
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
