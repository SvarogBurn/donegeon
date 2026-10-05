# Browser checks

Playwright scripts that click through the running app and print `PASS` / `FAIL`
per check. They are scripts, not a test runner suite.

| Script | Covers |
|---|---|
| `m2.mjs` | lists, goals, deadlines, countdown table, dashboard pressure, drag rules |
| `m2b.mjs` | deadline pill colours, row click → detail page, summary cells, weekday table, instant tick |
| `combined.mjs` | dashboard "All deadlines" table: paces added up, deadline marker rows |
| `done.mjs` | dashboard "Done" box: stepping day by day, calendar pick, no future days; Done tab: subtasks under the day they were ticked |
| `labels.mjs` | several goals and tags per task, filtering |
| `lists.mjs` | default list, deleting lists with undo, goal tags on subtasks |
| `del.mjs` | Delete key on tasks |
| `undo.mjs` | Ctrl+Z after deleting tasks |
| `layout.mjs` | dashboard box order |
| `m3.mjs` | list kinds and points per item, earning / spending / reversing points, Done tab, persistent tasks and rewards, points history, Today box (marking, dragging in, tasks written there), the tile grid (columns, pinning, phone width) |
| `tiles.mjs` | the tile arrangement survives deleting a list (and its undo), window resizes and a reload |
| `hide.mjs` | hiding boxes with the minimize button, the Hidden row that brings them back, surviving a reload |
| `logout.mjs` | log out lands on the login page, stays logged out, works again after logging back in |
| `repeat.mjs` | tasks on a schedule: every N days / weeks / months, due today and in Today by itself, done and undone, late rounds, planned days vs after done, taking the schedule off |
| `subpoints.mjs` | points on subtasks: their own amount, the main task's amount handed down, ticking and unticking, switching it off |
| `colors.mjs` | a list's own colour: the band and the switch take it, light colours get a dark title, any other colour, back to the kind's own |
| `folders.mjs` | folders as tabs of the task bar: dropping lists on New / a folder (a copy: the list stays on Tasks), the folder's page, taking a box out by dropping it on Tasks, stats boxes copied into a folder, name and colour by click, right-click and hold, removing a folder |
| `stats.mjs` | the stats on the user's page: done counts, streaks, dots, deadlines, time to finish, per list / goal, moving, pinning and hiding every box (Account, Settings and the filter too), a second column, the filter, phone width |
| `ticked.mjs` | ticked tasks sit under the open ones: subtasks within their task, main tasks within their list, back in place when unticked, Alt+↑ / Alt+↓ stepping over them; no ticking a task before its subtasks; the user page's choice for ticked tasks (bottom, stay, hide) |

## Run

Needs the dev servers running (`localhost:5173` and `:3001`, see the main README).

```sh
cd e2e
npm install
npx playwright install chromium-headless-shell
node m2.mjs
```

Each script signs up a fresh `uitest…` account. Remove them afterwards:

```sh
docker compose exec -T db psql -U donegeon -c "DELETE FROM \"User\" WHERE username LIKE 'uitest%'"
```
