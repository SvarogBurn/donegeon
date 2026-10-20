import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";

/** Every page loaded apart from the app, to be fetched once the first one is on the screen (usePreloadPages). */
const loaders: (() => Promise<unknown>)[] = [];

/** A reload asked for by a page that couldn't be fetched, to try once and not again and again. */
const RELOADED_KEY = "donegeon.reloadedForPage";

/**
 * A page loaded apart from the app, so the Tasks page opens sooner. One that can't be fetched while online was
 * removed by a deploy since this tab opened: the app reloads once, into the new version.
 */
function page<M>(load: () => Promise<M>, name: keyof M) {
  loaders.push(load);
  return lazy(async () => {
    try {
      const loaded = await load();
      try {
        // It worked: a later deploy may reload again.
        sessionStorage.removeItem(RELOADED_KEY);
      } catch {
        // Nothing kept, nothing to forget.
      }
      return { default: loaded[name] as ComponentType };
    } catch (error) {
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(RELOADED_KEY) !== null;
        sessionStorage.setItem(RELOADED_KEY, "1");
      } catch {
        // Without storage it doesn't try: a loop of reloads would be worse than the error.
        reloaded = true;
      }
      if (navigator.onLine && !reloaded) window.location.reload();
      throw error;
    }
  });
}

/**
 * Once the first page is on the screen, the others are fetched too, while nothing else is going on: then they open
 * at once, and offline as well, even before the service worker has kept them (and in development, which has none).
 */
function usePreloadPages() {
  useEffect(() => {
    const fetchAll = () => loaders.forEach((load) => void load().catch(() => {}));
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(fetchAll, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(fetchAll, 1500);
    return () => clearTimeout(id);
  }, []);
}

const CalendarPage = page(() => import("./pages/Calendar"), "CalendarPage");
const DonePage = page(() => import("./pages/Done"), "DonePage");
const NoteScreen = page(() => import("./components/Notes/NoteScreen"), "NoteScreen");
const NotesPage = page(() => import("./pages/Notes"), "NotesPage");
const PointsPage = page(() => import("./pages/Points"), "PointsPage");
const StatsPage = page(() => import("./pages/Stats"), "StatsPage");
const TaskPage = page(() => import("./pages/TaskPage"), "TaskPage");
const CountdownRedirect = page(() => import("./pages/TaskPage"), "CountdownRedirect");
const UserPage = page(() => import("./pages/User"), "UserPage");

const loading = <p className="text-sm text-stone-500">Loading…</p>;
const later = (element: ReactNode) => <Suspense fallback={loading}>{element}</Suspense>;

/** A folder's own page: the dashboard, showing that folder's lists. */
function FolderPage() {
  const { folderId } = useParams();
  return <Dashboard key={folderId} folderId={folderId} />;
}

export function App() {
  usePreloadPages();
  return (
    <Routes>
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="folders/:folderId" element={<FolderPage />} />
        <Route path="done" element={later(<DonePage />)} />
        <Route path="stats" element={later(<StatsPage />)} />
        <Route path="calendar" element={later(<CalendarPage />)} />
        <Route path="notes" element={later(<NotesPage />)} />
        <Route path="notes/:noteId" element={later(<NoteScreen />)} />
        <Route path="points" element={later(<PointsPage />)} />
        <Route path="user" element={later(<UserPage />)} />
        <Route path="tasks/:taskId" element={later(<TaskPage />)} />
        <Route path="tasks/:taskId/countdown" element={later(<CountdownRedirect />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
