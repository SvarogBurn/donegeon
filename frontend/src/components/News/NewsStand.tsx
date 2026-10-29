import { useContext } from "react";
import { Link } from "react-router";
import photo from "../../../../assets/news/48x32castle_photo_v1.svg";
import stamp from "../../../../assets/news/24x11new_stamp_v1.svg";
import { localDate } from "../../lib/clock";
import { useUnseenNews } from "../../lib/newsSeen";
import { TileControlsContext } from "../Tiles/TileFrame";
import { LATEST_ISSUE, paperDate } from "./Paper";

/**
 * The News box on the user's page, the way to the News page: no box frame, but the paper itself, folded small. The
 * masthead and strip as the front page has them, "Recent updates" for a headline beside its photo (the art, not its
 * text: lines of print in its place), and a red NEW stamp on the photo while an article is unread on this device. The
 * whole sheet opens the paper. Its tab and minimize buttons sit on its top right corner.
 */
export function NewsStand() {
  const controls = useContext(TileControlsContext);
  const isNew = useUnseenNews().length > 0;

  return (
    <section className="news-stand relative" aria-label="News" data-news-stand>
      <Link to="/news" className="news-paper news-stand-paper block" title="Read The Donegeon Post" data-news-stand-open>
        <p className="news-masthead text-center !text-[48px]">The Donegeon Post</p>
        <div className="news-strip mt-[calc(3*var(--u))]">
          <span>{paperDate(localDate())}</span>
          {LATEST_ISSUE > 0 && <span>Vol. 1, No. {LATEST_ISSUE}</span>}
        </div>
        <div className="mt-[calc(4*var(--u))] flex flex-col items-center gap-[calc(4*var(--u))] sm:flex-row sm:items-start">
          <div className="relative flex-none">
            <img src={photo} alt="" className="news-stand-photo" />
            {isNew && <img src={stamp} alt="New" className="news-stand-stamp" data-news-new />}
          </div>
          <div className="w-full min-w-0 flex-1 space-y-[calc(3*var(--u))]">
            <h3 className="font-pixel text-sm leading-snug text-[var(--text-strong)]">Recent updates</h3>
            {/* Columns of print, as many whole ones as there is room for: the ones that don't fit wrap away, out of sight. */}
            <span className="news-stand-print" aria-hidden>
              {[0, 1, 2, 3].map((column) => (
                <span key={column} />
              ))}
            </span>
          </div>
        </div>
      </Link>
      {controls && (
        <div className="absolute top-[calc(3*var(--u))] right-[calc(4*var(--u))] flex gap-[var(--u)]">
          {controls.onDragStart && (
            <button
              type="button"
              className="tile-button tile-button-tab !mt-0"
              onPointerDown={controls.onDragStart}
              aria-label={`Drag to move ${controls.name}`}
              title={controls.dragTitle}
            />
          )}
          {controls.onHide && (
            <button
              type="button"
              className="tile-button tile-button-min !mt-0"
              aria-label={`Hide ${controls.name}`}
              title="Hide this box; bring it back from the Hidden row at the bottom of the page"
              onClick={controls.onHide}
            />
          )}
        </div>
      )}
    </section>
  );
}
