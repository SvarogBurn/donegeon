import { useScheduleUpload } from "../../hooks/notifications";

/** Plans the notifications the server sends, from the tasks, whenever they change (see useScheduleUpload). Shows nothing. */
export function NotificationPlanner() {
  useScheduleUpload();
  return null;
}
