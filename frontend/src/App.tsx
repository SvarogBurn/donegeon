import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { DonePage } from "./pages/Done";
import { PointsPage } from "./pages/Points";
import { CountdownRedirect, TaskPage } from "./pages/TaskPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="done" element={<DonePage />} />
        <Route path="points" element={<PointsPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="tasks/:taskId/countdown" element={<CountdownRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
