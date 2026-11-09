import type { NoteFolder } from "../types";

/** The folders straight inside `parentId` (null: the top-level ones), in their order. */
export const childrenOf = (folders: NoteFolder[], parentId: string | null) => folders.filter((folder) => folder.parentId === parentId);

/** The folders from the top level down to `id`, `id` last; empty for a folder that isn't there. */
export function pathTo(folders: NoteFolder[], id: string | null): NoteFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: NoteFolder[] = [];
  // Never round a loop more than once (the server refuses one; a cache caught mid-move could still show one).
  for (let at = id ? byId.get(id) : undefined; at && !path.includes(at); at = at.parentId ? byId.get(at.parentId) : undefined) path.unshift(at);
  return path;
}

/** `id` and every folder inside it, however deep: where it can't be put. */
export function insideOf(folders: NoteFolder[], id: string): Set<string> {
  const inside = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const folder of folders) {
      if (!folder.parentId || !inside.has(folder.parentId) || inside.has(folder.id)) continue;
      inside.add(folder.id);
      grew = true;
    }
  }
  return inside;
}

/** Every folder, each followed by the ones inside it (depth 0 = top level), as a list to pick from. */
export function treeOrder(folders: NoteFolder[]): { folder: NoteFolder; depth: number }[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const rows: { folder: NoteFolder; depth: number }[] = [];
  const seen = new Set<string>();
  const add = (folder: NoteFolder, depth: number) => {
    seen.add(folder.id);
    rows.push({ folder, depth });
    for (const child of folders) if (child.parentId === folder.id && !seen.has(child.id)) add(child, depth + 1);
  };
  // A folder whose parent isn't there (removed meanwhile) shows at the top level.
  for (const folder of folders) if (!seen.has(folder.id) && !(folder.parentId && ids.has(folder.parentId))) add(folder, 0);
  return rows;
}
