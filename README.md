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

On the dashboard a task's subtasks start hidden: click the arrow at the left of its row to show them. They are shown from the start on the task's own page and while a goal or tag filter is on.

## Points, rewards, Today

- Every list is a **task list** (its items add points) or a **reward list** (its items cost points), with a points-per-item amount. Both are set when the list is created and can be changed in the list's header.
- A task list is blue and a reward list orange, until you pick the list's own colour with the swatch on the plate in its top left corner, after the points: a few to choose from, "Other" for any colour, and a way back. The box's band and its Task / Reward switch take the colour.
- Ticking a main task books its points and moves it to the **Done** tab; unticking it there puts it back and reverses the points.
- Subtasks are worth nothing unless you say so. Give one its own amount in its ⋯ menu, or tick **Subtasks earn this too** in the main task's ⋯ menu: every subtask without an amount of its own is then worth what the main task is (as a main task takes its list's amount). Ticking a subtask books its points, unticking takes them back.
- In a task's ⋯ menu: **Do today** (shows it in the Today box until it is done), **Persistent** (a repeat button instead of a checkbox: can be done or bought again and again), and its own point amount (empty = the list's amount).
- **Repeat**, in the ⋯ menu once Persistent is ticked: put a number in "Every" and pick days, weeks or months ("every 3 weeks"). The task is then due on its day: it shows "due today" in its list and comes into the Today box by itself. Press its repeat button when it is done; it greys out and shows the next day until then. "Next" sets the next day by hand. **Planned days** keeps the rhythm even when you are late; **After done** counts the next round from the day you did it. Empty the number to take the schedule off.
- The balance in the task bar at the bottom opens the points history.
- The Today box also has its own field: a task typed there lives only in Today until you drag it into a list. It is worth what the "N each" field at the top of the Today box says (2 to start with) unless you give it its own amount; once dragged into a list it follows that list.

## Stats

Click your name in the task bar: under the Account box are your stats. They cover tasks and subtasks, never rewards.

- **Done**: done today / this week (from Monday) / this month / ever, the current and longest streak of days with something done, and a dot per day for the last year (stronger = more done).
- **Written down**: at which weekday and hour tasks get written down.
- **Deadlines**: how often hard and soft deadlines were met, and how many days early or late tasks were finished.
- **Time to finish**: median days from written down to done, and how far ahead deadlines are set. The bars group tasks by how long they took, in buckets that follow your data (six at most, the last one "Longer").
- **By list / goal / tag**: how much was done in each, how often on time, how long it took, and each one's share over time.
- **Points**: the balance day by day.
- **Unorganized**: open main tasks with no deadline, goal or tag.

The filter at the top (dates, list, goal, tag, deadline type, repeating) narrows all of them at once. Each stats box can be dragged, pinned and minimized like the boxes of the dashboard. A subtask counts under its main task's list, goals and tags.

## Folders

A folder is a tab of your own in the task bar, next to Tasks and Done, holding some of your lists.

- The **+ New** tab is out of sight until it is needed. Start dragging a list by the handle on its title band and it appears in the task bar: drop the list on it to make a folder with the list in it, which then asks for its name.
- For an empty folder, click the task bar's empty space (or right-click it, or press and hold it): **+ New** comes out; click it. Escape or a click elsewhere puts it away again.
- Drag more lists onto the folder's tab to add them, onto another folder's tab to move them there, and onto **Tasks** to take them back out.
- Click a folder's tab to open its page: its lists, and a field for new lists that go straight into the folder.
- To change a folder's name or colour, right-click its tab, press and hold it, or click it while its page is open. "Remove folder" there removes the tab only: its lists go back to the Tasks page.
- Tasks in a folder's lists still count everywhere: Today, the deadline boxes, Done and the stats.

## Arranging the dashboard

Every box has a drag handle and a Pin button on its title band. Drag a box above or below another, into another column, or onto the strip at the right edge for a new column; Pin keeps it in a band across the top. The arrangement is saved per account, separately for each screen width.

Every box also has a minimize button on its band, which hides it; on a list it sits between the drag handle and the delete button. Hidden boxes are listed in a "Hidden" row under the boxes; click one to bring it back where it was. Which boxes are hidden is saved per account. A hidden list keeps its tasks: they still count for Today, the deadlines and the stats.

The stats boxes on your own page work the same way (drag, pin, minimize), with an arrangement of their own.

## On a phone

To try the dev build from a phone on the same WiFi, start the frontend with
`npm run dev -- --host` and open the "Network" address it prints.

Under 640px wide the task bar shows its icons and logo at half size and keeps the same bar, only smaller, a task's ⋯ menu
opens as a sheet along the bottom of the screen, and the tables use smaller
text so they fit without sideways scrolling.

## Production build and deploy

In production one Node process serves both the API and the built app:

```sh
(cd frontend && npm ci --include=dev && npm run build)
(cd backend && npm ci --include=dev && npx prisma generate && npm run build)
cd backend && npx prisma migrate deploy && NODE_ENV=production npm start
```

It needs `DATABASE_URL`, `SESSION_SECRET` and `NODE_ENV=production` (which turns
on secure cookies, so it must sit behind HTTPS). `render.yaml` describes exactly
this for Render: create a Blueprint from the repo and paste a hosted Postgres
connection string (e.g. Neon) into `DATABASE_URL`. `GET /api/health` is the
health check.

## Your account

Your icon and name at the right of the task bar open your own page, which is
where Log out is.

## Changing the time and date

The clock at the right of the task bar shows the time with the date under it.
Click it to change either one: the app then treats that moment as now (what
"today" is for completion stamps, countdowns and the daily rollover). A changed
time keeps running, and rolls the day over at midnight; a changed date stays
until "Back to the real time". The clock is amber while it is not the real
time. Anyone can do this, in any build; it is stored in that browser only.

## Specs

donegeon/
├── backend/            Express 5 + Prisma API (port 3001)
├── frontend/           React 19 + Vite SPA (port 5173)
├── e2e/                Playwright browser-check scripts
└── docker-compose.yml  Postgres on localhost:5432

Backend: 
index.ts starts the server.