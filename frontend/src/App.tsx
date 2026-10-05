import { Navigate, Route, Routes, useParams } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { DonePage } from "./pages/Done";
import { PointsPage } from "./pages/Points";
import { CountdownRedirect, TaskPage } from "./pages/TaskPage";
import { UserPage } from "./pages/User";

/** A folder's own page: the dashboard, showing that folder's lists. */
function FolderPage() {
  const { folderId } = useParams();
  return <Dashboard key={folderId} folderId={folderId} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="folders/:folderId" element={<FolderPage />} />
        <Route path="done" element={<DonePage />} />
        <Route path="points" element={<PointsPage />} />
        <Route path="user" element={<UserPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="tasks/:taskId/countdown" element={<CountdownRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
