# Anong Score Na?

A courtside **pickleball scorecard** web app — built for phones and tablets, no build step, no backend.

Live app: **https://leemontes.github.io/anong-score-na/**

## Features

- **Animated split-flap scorecard** — tap a team's score to add a point, two-finger tap to subtract, or use the +/− buttons. Yellow digits on a dark board with a white server indicator.
- **Serve tracking** — Server 1 / 2 and serving side for doubles; single server for singles.
- **Game timer** — starts the moment a match starts and stops when it ends.
- **Fullscreen & rotate** — a clean fullscreen landscape board for courtside use.
- **Players & Matches** — add players, auto-draft a round-robin schedule, play and finalize matches, live standings, and "Wrap up day".
- **Sessions** — an archive of wrapped-up days, each with its own schedule and standings.
- **All Time Leaderboard** — combined record across every session, with gold/silver/bronze medals for the top 3.
- **Info page** — explains scoring, each page, and where data is stored.
- **Light / dark mode**.

## Pages

| Page | What it does |
| --- | --- |
| **Scorecard** | Live score, serve, timer, fullscreen/rotate, and a "Score card tester" for a quick untied card. |
| **Players & matches** | Roster, round-robin draft, play/finalize matches, live standings, wrap up day. |
| **Sessions** | Archive of wrapped-up days with schedule + standings. |
| **All Time** | Aggregate leaderboard across all sessions. |
| **Info** | How it works and where data lives. |

## Scoring

- Games go to **11 points** — first side to reach 11 wins (no win-by-2).
- **Doubles (2v2):** the middle shows Server 1 / 2 (tap to switch) plus a serving-side selector. **Singles (1v1):** one server.
- Tap a score **+1**, two-finger tap **−1**, or use the +/− buttons. Undo and Reset sit below.

## Tech

- Plain **HTML, CSS, and JavaScript** — no frameworks, no build tools.
- Data is stored in the browser's **`localStorage`** (keys: `rally-pickleball-v1` and `anong-theme`). It stays on the device — no account, no server, no cloud, and it won't sync across devices.

## Run locally

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 5500
```

Then visit `http://localhost:5500`.

## Deploy

Hosted with **GitHub Pages** from the `main` branch. Push to `main` and the site updates automatically:

```sh
git add .
git commit -m "update"
git push
```
