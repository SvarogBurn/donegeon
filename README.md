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
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | bold / italic / underline around the selected words |
| `↑` / `↓` | move between tasks |
| `Alt+↑` / `Alt+↓` | reorder among siblings |
| `Delete` at the end of a title | delete the task and its subtasks |
| `Ctrl+Z` within 10 seconds of a delete | bring it back (after that it is deleted for good within a couple of minutes) |
| `Esc` | discard the new row / undo the edit in progress |

On the dashboard a task's subtasks start hidden: click the arrow at the left of its row to show them. They are shown from the start on the task's own page and while a goal or tag filter is on.

Any task, a subtask too, can carry a note. While its title is being edited a grey notes icon shows beside it (the ⋯ menu has **Note** too, and `// …` typed with a new task writes one): click it and the note opens in a pane at the side of the page (along the bottom on a phone), framed in its list's colour; a long note scrolls inside it. Once the note has text the icon stays on the row in colour; click it to read the note, and **Edit** to write in it. Leaving the field or `Esc` saves it; emptying it, or **Delete** under it (it asks first), removes the note. A click outside the pane, `Esc` or × closes it. In a note, the title markup works (`**bold**` and the rest, `Ctrl+B/I/U`), a line starting `# `, `## ` or `### ` is a heading (`#tag` and `\#` stay text), and a line starting `* `, `- ` or `1. ` is a list item: `Enter` starts the next one, `Enter` on an empty one ends the list, `Tab` / `Shift+Tab` nest it. A task with a note has its own page too (click its row), with the note at the bottom (bottom left on a wide screen).

## Typing shortcuts

While adding a task (a list's add field, a new row, the Today box, a day of the calendar) or editing the title of one there is, these can be typed anywhere in the title. They are taken out of the title and set on the task; chips under the field show what it will get, and a dropdown offers what could finish the one being typed. On a task there is, a tag or goal joins the ones it has, a note goes under the note it has, a date, points or a schedule replace its own, and `/list` moves it to the end of that list; text that was in the title already stays text.

| Type | What it does |
|---|---|
| `#name` | adds a tag; a new name makes a new tag |
| `^name` | adds a goal; a new name makes a new goal |
| `@date` | hard deadline |
| `~date` | soft deadline |
| `@today` / `@now` | do today: it shows in the Today box and stays in its list |
| `@every …` | repeats: `@daily`, `@weekly`, `@monthly`, `@every 2 weeks`, `@every fri` |
| `@persistent` | persistent, with no schedule: a repeat button instead of a checkbox |
| `5p` | its points |
| `/list` | puts it in that list |
| `// note` | everything after it is the task's note |
| `\` in front | keeps a shortcut as plain text |

Dates: `tomorrow` (`tmr`), a weekday (`fri`, the next one), `next week`, `next month`, `in 3 days`, `3d`, `2w`, `25/12`, `25/12/26`, `25 dec`; after `~` also `today`. A shortcut counts only at the start of a word. Deadlines are for main tasks and their direct subtasks; lists for main tasks. The same table is in the app, in the Cheat sheet box of the user page.

## Styling a title

Any task's title can hold markup. The markers show while the title is being typed in and are hidden everywhere else.

| Type | Shows as | Key |
|---|---|---|
| `**bold**` | bold | `Ctrl+B` |
| `*italic*` | italic | `Ctrl+I` |
| `__underline__` | underlined | `Ctrl+U` |
| `==highlight==` | highlighted | |
| `~~crossed out~~` | crossed out | |

The keys put the marker around the selected words, or take it off. Styles can sit inside one another (`**a *b* c**`). A marker counts only when it hugs the words and is closed on the same line, so `5 * 3 * 2` and `snake_case` are left alone; a backslash in front of one keeps it as text.

## Arranging the dashboard

- Drag boxes between positions and columns, or onto the right edge for a new column
- **Pin** keeps a box in a band across the top
- **Minimize** hides a box into the "Hidden" row (its tasks still count)
- Layout saved per account and per screen width; the Stats page has its own

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
where Log out is. Its Account box also shows your streak and how many tasks you have done this calendar year (counted as the Stats page counts them: ticks and presses of repeating tasks, rewards left out).

**Delete account**, in the same box, deletes the account and everything in it
(tasks, lists, folders, goals, tags, points, stats, mail sent to the devs) for
good, and logs it out everywhere. It asks first, and only goes ahead once
`donegeon/<your username>` has been typed.

Under **Theme** in the Settings box, **Font in boxes** picks the font of the text inside the boxes: tasks and
subtasks and their notes, goals and tags, Today, Done, the stats, these settings, a note shown in a folder, and the
small menus and dialogs. Titles keep the pixel font: the band of each box, the task bar, the search field. **Font in
notes** does the same for the Notes page's notes, their titles too. Each is one of Pixel (the default), Simple (an
ordinary font, a little larger, as it is much narrower), OpenDyslexic, or Large print (Atkinson Hyperlegible, half as
big again as Simple). An open dropdown's choices are in the dropdown's own font. They are saved per account.

## The tutorial

A new account is walked through the app the first time it is opened: a few words on points and rewards,
then a pointer that waits for each thing to be done (a task, subtasks, a deadline, a reward list, a folder,
hiding a box, the Today and Week tabs, dressing up your character). "Skip tutorial" ends it at any point; **Repeat the tutorial** in the Settings box on your own page
starts it again. It does not show in a browser driven by automation, unless
`localStorage["donegeon.forceTutorial"]` is set.


## Specs

donegeon/
├── backend/            Express 5 + Prisma API (port 3001)
├── frontend/           React 19 + Vite SPA (port 5173)
└── docker-compose.yml  Postgres on localhost:5432
