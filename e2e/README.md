# Browser checks

Playwright scripts that click through the running app and print `PASS` / `FAIL`
per check. They are scripts, not a test runner suite.

| Script | Covers |
|---|---|
| `m2.mjs` | lists, goals, deadlines, countdown table, dashboard pressure, drag rules |
| `m2b.mjs` | deadline pill colours, row click → detail page, summary cells, weekday table, instant tick |
| `combined.mjs` | dashboard "All deadlines" table: paces added up, deadline marker rows |
| `done.mjs` | dashboard "Done" box: stepping day by day, calendar pick, no future days |
| `labels.mjs` | several goals and tags per task, filtering |
| `lists.mjs` | default list, deleting lists with undo, goal tags on subtasks |
| `del.mjs` | Delete key on tasks |
| `undo.mjs` | Ctrl+Z after deleting tasks |
| `layout.mjs` | dashboard box order |
| `m3.mjs` | list kinds and points per item, earning / spending / reversing points, Done tab, persistent tasks and rewards, points history, Today box (marking, dragging in, tasks written there), the tile grid (columns, pinning, phone width) |
| `tiles.mjs` | the tile arrangement survives deleting a list (and its undo), window resizes and a reload |
| `logout.mjs` | log out lands on the login page, stays logged out, works again after logging back in |

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
