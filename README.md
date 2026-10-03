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

## Points, rewards, Today

- Every list is a **task list** (its items add points) or a **reward list** (its items cost points), with a points-per-item amount. Both are set when the list is created and can be changed in the list's header.
- Ticking a main task books its points and moves it to the **Done** tab; unticking it there puts it back and reverses the points. Subtasks carry no points.
- In a task's ⋯ menu: **Do today** (shows it in the Today box until it is done), **Persistent** (a ↻ button instead of a checkbox: can be done or bought again and again), and its own point amount (empty = the list's amount).
- The balance in the nav bar opens the points history.

## Dev date

In dev builds the nav bar has a dashed "Dev date" field. Setting it makes the
app treat that day as today (completion stamps now; countdown and daily
rollover later). "reset" goes back to the real date.

## Specs

donegeon/
├── backend/            Express 5 + Prisma API (port 3001)
├── frontend/           React 19 + Vite SPA (port 5173)
├── e2e/                Playwright browser-check scripts
└── docker-compose.yml  Postgres on localhost:5432

Backend: 
index.ts starts the server.