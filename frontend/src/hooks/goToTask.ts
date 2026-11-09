import { useLocation, useNavigate } from "react-router";
import { listView, TODAY_VIEW } from "../lib/folders";
import { findNode } from "../lib/optimisticToggle";
import { boxTabOf, findTaskRow, pathIdsTo, showOnPage } from "../lib/showOnPage";
import { normalizeLayout, withCollapsed, withHidden, type DashboardLayout } from "../lib/tileLayout";
import { useFolders, useUpdateFolder } from "./folders";
import { useLayout, useSaveLayout } from "./layout";
import { useTaskTrees } from "./tasks";

/** A page that shows the task's box: the Tasks page, or a folder with a copy of it. */
interface Place {
  path: string;
  /** The box's key in that page's layout. */
  key: string;
  layout: DashboardLayout;
  save: (layout: DashboardLayout) => void;
}

/**
 * Goes to a task's row, to be edited there (renamed, given subtasks, a deadline): in its list, or, for a task written
 * into Today or Week, in the Today box, on that tab (boxTabOf). This page if it shows that box, else the Tasks page,
 * else a folder with a copy of it; hidden everywhere, it is shown on the Tasks page again. A box folded to its band is
 * opened. Returns false when the task is no longer in the lists (ticked long enough ago to be on the Done page only).
 */
export function useGoToTask() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: trees = [] } = useTaskTrees();
  const { data: folders = [] } = useFolders();
  const tasksLayout = useLayout();
  const saveTasksLayout = useSaveLayout();
  const updateFolder = useUpdateFolder();

  return (id: string) => {
    const pathIds = pathIdsTo(trees, id);
    if (!pathIds) return false;
    const main = findNode(trees, pathIds[0] ?? id);
    const listId = main?.listId ?? null;
    const view = listId ? listView(listId) : TODAY_VIEW;
    const places: Place[] = [
      // On the Tasks page Today's key is its own; a list's is its view.
      { path: "/", key: listId ? view : "today", layout: normalizeLayout(tasksLayout.data), save: (layout) => saveTasksLayout.mutate(layout) },
      ...folders
        .filter((folder) => folder.views.includes(view))
        .map((folder) => ({ path: `/folders/${folder.id}`, key: view, layout: normalizeLayout(folder.layout), save: (layout: DashboardLayout) => updateFolder.mutate({ id: folder.id, changes: { layout } }) })),
    ];
    const shown = (place: Place) => !place.layout.hidden?.includes(place.key);
    const place = places.find((one) => one.path === pathname && shown(one)) ?? places.find(shown) ?? places[0];
    if (!shown(place) || place.layout.collapsed?.includes(place.key)) place.save(withCollapsed(withHidden(place.layout, place.key, false), place.key, false));
    if (place.path !== pathname) navigate(place.path);
    const tab = boxTabOf(main);
    showOnPage((isLast) => (tab ? findTaskRow(id, pathIds, isLast, "page", tab) : findTaskRow(id, pathIds, isLast, "lists")));
    return true;
  };
}
