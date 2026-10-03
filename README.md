# Donegeon

Task / goal / rewards tracker

## Run it locally

Needs Node.js and Docker.

First time only:

```sh
cp backend/.env.example backend/.env
(cd backend && npm install)
(cd frontend && npm install)
```

Every time, from the repo root:

```sh
docker compose up -d                      # Postgres on localhost:5432
(cd backend && npx prisma migrate dev)    # applies any new migrations
```

Then in two terminals:

```sh
cd backend && npm run dev     # API on http://localhost:3001
cd frontend && npm run dev    # app on http://localhost:5173
```

Open http://localhost:5173.

## Useful commands

| Where | Command | What |
|---|---|---|
| `backend/` | `npm test` | unit tests |
| `backend/` | `npm run typecheck` | type check |
| `backend/` | `npm run studio` | browse the database in a browser |
| `frontend/` | `npm run build` | type check + production build |
| repo root | `docker compose down` | stop Postgres (data is kept) |
| repo root | `docker compose down -v` | stop Postgres and wipe all data |

## Keyboard and mouse

In a task:

| Key | What it does |
|---|---|
| `Enter` | new task below, at the same depth (on an empty new row: close it) |
| `Ctrl+Enter` | new subtask |
| `Shift+Enter` | new line inside the title |
| `↑` / `↓` | move between tasks |
| `Alt+↑` / `Alt+↓` | reorder among siblings |
| `Delete` at the end of a title | delete the task and its subtasks |
| `Ctrl+Z` within 10 seconds of a delete | bring it back |
| `Esc` | discard the new row / undo the edit in progress |

## Dev date

In dev builds the nav bar has a dashed "Dev date" field. Setting it makes the
app treat that day as today (completion stamps now; countdown and daily
rollover later). "reset" goes back to the real date.
# donegeon
# donegeon
# donegeon
