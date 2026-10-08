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
- Ticking a main task books its points and moves it to the **Done** page (click anywhere on the dashboard's Done box to open it); unticking it there puts it back and reverses the points. Subtasks show on the Done page too, each under the day it was ticked, without waiting for their main task to be finished.
- A ticked task or subtask stays in its list, ticked, for 24 hours, so you can still untick it; after that it is only on the Done page (where it can be unticked too). A persistent task stays open; every time you press its repeat button, a ticked, crossed-off copy of it appears underneath (five presses, five copies). Untick a copy to take that one back. The copies go after 24 hours too.
- A task can only be ticked once all its subtasks are, at every depth: until then its box is greyed out.
- Ticked tasks sit at the bottom: a ticked main task under the open ones of its list, a ticked subtask under the open subtasks of the same task. Untick one and it is back where it was. On your own page (click your name in the task bar), **Ticked tasks** in the Settings box changes that: they can stay where they are instead, or be hidden, which takes a task out of the Tasks tab and your folders the moment it is ticked (Ctrl+Z brings it back; after that, untick it on the Done page).
- Subtasks are worth nothing unless you say so. Give one its own amount in its ⋯ menu, or tick **Subtasks earn this too** in the main task's ⋯ menu: every subtask without an amount of its own is then worth what the main task is (as a main task takes its list's amount). Ticking a subtask books its points, unticking takes them back.
- In a task's ⋯ menu: **Do today** (shows it in the Today box until it is done), **Persistent** (a repeat button instead of a checkbox: can be done or bought again and again), and its own point amount (empty = the list's amount).
- **Repeat**, in the ⋯ menu once Persistent is ticked: put a number in "Every" and pick days, weeks or months ("every 3 weeks"). The task is then due on its day: it shows "due today" in its list and comes into the Today box by itself. Press its repeat button when it is done; it greys out and shows the next day until then. "Next" sets the next day by hand. **Planned days** keeps the rhythm even when you are late; **After done** counts the next round from the day you did it. Empty the number to take the schedule off.
- The balance in the task bar at the bottom opens the points history.
- The Today box also has its own field: a task typed there lives only in Today until you drag it into a list. It is worth what the "N each" field at the top of the Today box says (2 to start with) unless you give it its own amount; once dragged into a list it follows that list.

## Stats

Click the **Stats** tab in the task bar. The stats cover tasks and subtasks, never rewards.

- **Done**: done today / this week (from Monday) / this month / ever, the current and longest streak of days with something done, and a dot per day for the last year (stronger = more done).
- **Written down**: at which weekday and hour tasks get written down.
- **Deadlines**: how often hard and soft deadlines were met, and how many days early or late tasks were finished.
- **Time to finish**: median days from written down to done, and how far ahead deadlines are set. The bars group tasks by how long they took, in buckets that follow your data (six at most, the last one "Longer").
- **By list / goal / tag**: how much was done in each, how often on time, how long it took, and each one's share over time.
- **Points**: the balance day by day.
- **Unorganized**: open main tasks with no deadline, goal or tag.

The Stats box's filter (dates, list, folder, goal, tag, deadline type, repeating) narrows all of them at once; Folder, there once you have a folder, keeps only the lists that folder shows. Each box has a colour of its own, on its band and in its bars and dots: Done is purple like the Done box, Deadlines stays blue so that red can mean late. Every box on the page (the filter too) can be dragged, pinned and minimized like the boxes of the dashboard, and dragged out to the right for another column, up to four. A subtask counts under its main task's list, goals and tags.

## Folders

A folder is a tab of your own in the task bar, next to Tasks and Stats: a page of views. It shows copies of lists and of stats boxes; the lists themselves stay on the Tasks page, the stats on the Stats page.

- The **+ New** tab is out of sight until it is needed. Start dragging a list (or a stats box) by the handle on its title band and it appears in the task bar: drop the box on it to make a folder showing it, which then asks for its name.
- For an empty folder, click the task bar's empty space (or right-click it, or press and hold it): **+ New** comes out; click it. Escape or a click elsewhere puts it away again.
- Drag more lists onto the folder's tab to show them there too. The same goes for the boxes on the Stats page, the filter included: a folder's copy of the filter narrows that folder's stats boxes.
- Click a folder's tab to open its page: what it shows, and a field for new lists, which are shown in the folder straight away (and are on the Tasks page like any list).
- To take something out of a folder, open the folder and drag the box onto **Tasks**. Only the folder's copy goes.
- To change a folder's name or colour, right-click its tab, press and hold it, or click it while its page is open. "Remove folder" there removes the tab only: no list is deleted or moved.
- Tasks in a folder's lists still count everywhere: Today, the deadline boxes, Done and the stats.

## Arranging the dashboard

Every box has a drag handle and a Pin button on its title band. Drag a box above or below another, into another column, or onto the strip at the right edge for a new column; Pin keeps it in a band across the top. The arrangement is saved per account, separately for each screen width.

Every box also has a minimize button on its band, which hides it; on a list it sits between the drag handle and the delete button. Hidden boxes are listed in a "Hidden" row under the boxes; click one to bring it back where it was. Which boxes are hidden is saved per account. A hidden list keeps its tasks: they still count for Today, the deadlines and the stats.

The stats boxes on the Stats page (the **Stats** tab in the task bar) work the same way (drag, pin, minimize), with an arrangement of their own.

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

**Delete account**, in the same box, deletes the account and everything in it
(tasks, lists, folders, goals, tags, points, stats, mail sent to the devs) for
good, and logs it out everywhere. It asks first, and only goes ahead once
`donegeon/<your username>` has been typed.

## The tutorial

A new account is walked through the app the first time it is opened: a few words on points and rewards,
then a pointer that waits for each thing to be done (a task, subtasks, a deadline, a reward list, a folder,
hiding a box). "Skip tutorial" ends it at any point; **Repeat the tutorial** in the Settings box on your own page
starts it again. It does not show in a browser driven by automation (the e2e scripts), unless
`localStorage["donegeon.forceTutorial"]` is set.

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