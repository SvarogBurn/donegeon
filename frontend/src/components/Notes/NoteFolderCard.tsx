import type { ReactNode } from "react";
import { folderIn } from "../../lib/frameTones";
import type { NoteFolder } from "../../types";
import { useTabPress, type OnTabDrag } from "../layout/tabDrag";

/**
 * A subfolder among the notes of the folder it is in (Notes page), as on a computer's desktop: its icon, big, in its
 * colour, and its name under it on one line, together as tall as a note's card. A click opens it; held or right-clicked,
 * its name and colour open (`children`, under it); dragged, it goes into another folder, or along the top of the page. A
 * note's card dropped on it goes in.
 */
export function NoteFolderCard({ folder, isEditing, isDragged, onOpen, onEdit, onDrag, children }: {
  folder: NoteFolder;
  isEditing: boolean;
  isDragged: boolean;
  onOpen: () => void;
  onEdit: (id: string | null) => void;
  onDrag: OnTabDrag;
  children?: ReactNode;
}) {
  const press = useTabPress<HTMLButtonElement>({ onDrag, onHoldRelease: () => onEdit(folder.id) });
  return (
    <div className="relative">
      <button
        ref={press.ref}
        type="button"
        className={`m-0.5 flex h-28 w-[calc(100%-4px)] flex-col items-center justify-center gap-1 p-1 text-center hover:bg-stone-300/40 dark:hover:bg-stone-700/40 ${isDragged ? "opacity-40" : ""}`}
        style={{ WebkitTouchCallout: "none", userSelect: "none" }}
        data-tab-drop={`notes:${folder.id}`}
        data-nest={folder.id}
        data-note-folder-id={folder.id}
        data-note-folder={folder.name}
        data-lifted={press.isLifted || undefined}
        aria-expanded={isEditing}
        aria-label={`Folder ${folder.name}`}
        title={`${folder.name}. Click to open it; drag it into another folder or to the top of the page; hold or right-click for its name, colour or to remove it; drop a note here to put it in.`}
        onPointerDown={press.onPointerDown}
        onClickCapture={press.onClickCapture}
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          // A finger's long-press: letting go opens it, unless the folder is dragged meanwhile.
          if (press.pressing.current) return;
          onEdit(folder.id);
        }}
      >
        <span className="tab-icon tab-icon-folder !size-[84px] flex-none" style={folder.color ? { backgroundImage: folderIn(folder.color) } : undefined} aria-hidden />
        <span className="max-w-full truncate note-title text-xs leading-4" data-on-page>
          {folder.name}
        </span>
      </button>
      {children}
    </div>
  );
}
