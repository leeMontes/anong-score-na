# AGENTS.md

Static pickleball scorecard web app: plain HTML/CSS/JS, **no package manager, no build step, no tests, no CI**. Do not introduce npm, bundlers, or frameworks.

## Commands
- Only automated check: `for f in js/*.js; do node --check "$f"; done` (syntax).
- Run locally: `python3 -m http.server 5500` → `http://localhost:5500`. Use HTTP, not `file://` — `localStorage` needs an origin.
- There is no lint/typecheck/test command. Verify UI changes by serving and checking in a browser.
- Deploy: push to `main`. GitHub Pages publishes the repo root automatically (repo is public). Live: https://leemontes.github.io/anong-score-na/

## Architecture (`js/`)
- Plain scripts (no ES modules). Every file is an IIFE that attaches functions to a shared global namespace `window.App = window.App || {}`; `index.html` loads them in dependency order with `<script defer>`: `core → timer → game → matches → standings → sessions → ui → export → live → main` (plus vendored `js/vendor/peerjs.min.js` + `js/vendor/qrcode.min.js` loaded first).
- File roles: `core.js` (namespace, `$`/`$$`, state + `loadState`/`saveState`, IDs, formatting, toasts) · `timer.js` (game stopwatch: `gameElapsedMs` / `syncGameTimer`) · `game.js` (scoreboard + scoring) · `matches.js` (roster, draft, schedule, match flow) · `standings.js` (live/All-Time + player modal) · `sessions.js` (archive, wrap-up, clear) · `ui.js` (`switchView`, theme, fullscreen) · `export.js` (session screenshot → canvas + Web Share/download) · `live.js` (WebRTC live share via PeerJS + QR; read-only viewer mode) · `main.js` (composition root).
- `main.js` is the **only** file that runs at load: it sets `App.state = App.loadState()`, binds every event listener, then does the initial render. Other files only *define* `App.foo` functions — no top-level side effects (this avoids load-order bugs, e.g. `loadState` calling `isWinningScore`).
- Cross-file calls go through the namespace: `App.renderGame()`, `App.saveState()`, etc. Shared mutable state lives on `App` (`App.state`, `App.scoreHistory`, `App.timerInterval`, `App.nextMatchId`, modals' timers, `App.theme`). DOM helpers: `App.$()` / `App.$$()`.
- Single `state` object (`{ players, matches, sessions, game }`) persisted by `App.saveState()`.
- **Storage keys:** `rally-pickleball-v1` (all app data) and `anong-theme` (light/dark). `rally-pickleball-v1` is a legacy name kept on purpose — **do not rename it**, it would erase users' saved data.
- `loadState()` tolerates older saves; keep new persisted fields backward-compatible.

## Modals & delegated DOM hooks
- Two modal styles coexist: **native `<dialog>`** for `#result-dialog`, `#next-match-dialog`, `#view-match-dialog`, and the three confirm dialogs (`#confirm-wrapup-dialog`, `#confirm-clear-dialog`, `#confirm-delete-dialog`) — opened with `.showModal()`; and **custom overlay divs** `#player-modal` / `#session-modal` toggled via `hidden` + an `.open` class (`z-index` 40 / 30, so the player modal stacks above the session modal). Destructive actions each have a confirm dialog; the global Escape handler skips closing the underlying modal while any native dialog is open.
- Interaction is wired with delegated `data-*` attributes — reuse these instead of adding new listeners: `data-view`, `data-score-tap`, `data-score` + `data-change`, `data-serving`, `data-match-id` + `data-completed`, `data-player-id`, `data-session-id`, `data-remove-player`, `data-close-*-modal`.

## State actions (don't guess the semantics)
- `resetGame({ keepMatch: true })` (Reset button) zeroes scores but keeps the linked match; `resetGame({ keepMatch: false })` (Score card tester, clear, wrap-up cleanup) detaches to a fresh HOME/AWAY card.
- `clearSchedule()` empties `App.state.matches` entirely; `wrapUpSession()` archives completed matches into `App.state.sessions` and leaves unplayed ones on the schedule.

## Live share & viewer mode
- `live.js` uses PeerJS (vendored) + the free PeerJS cloud for signaling — no backend. Host "Go live" → random room id → QR of `?live=<roomId>`; `App.broadcastLive` (called from `saveState`) pushes the whole `state` to connected viewers.
- Viewer: a `?live=<roomId>` URL sets `App.isViewer = true` + `body.viewer` (read-only). `saveState()` is a no-op and the mutating `App.*` functions early-return when `App.isViewer`. `main.js` starts from `initialState` (not localStorage) and calls `App.initLiveViewer`.
- Needs a secure context (HTTPS / localhost). The PeerJS free cloud is fine for demo; cross-network NAT traversal can require TURN.

## Adding / changing a page
Views are show/hide sections, not routes. To add a page you MUST:
1. add a nav `<button data-view="X-view">` with both `.nav-label-full` and `.nav-label-short` spans (mobile uses the short one),
2. add `<section class="view" id="X-view">`,
3. add a branch in `switchView()` (in `js/ui.js`) calling that page's `renderX()`.
The `renderX()` function is defined on `App` in the matching module (e.g. `standings.js`), and any new event listeners go in `bindEvents()` inside `js/main.js`.
Existing views: `score-view`, `session-view`, `sessions-view`, `alltime-view`, `info-view`.

## Shared standings code (one change affects all three views)
- `computeStandings(players, matches)` + `buildStandingsList(container, standings, onSelect, { showGames })` render the live leaderboard, the session-detail modal, and the All Time page.
- Top 3 ranks render as 🥇🥈🥉 medals; `{ showGames: true }` adds the GP column.
- All Time = `buildAllTimeContext()`, which merges every session's snapshot players/matches with the current completed matches.

## Scoring / timer — intentional, don't "fix"
- Games are **first to 11, no win-by-2** (`isWinningScore`).
- The timer starts when a match is loaded, or on Reset / Score card tester — **not** on the first point.
- Score digits are pointer-driven (`data-score-tap`): single tap +1, two-finger tap −1, with click suppression and `touch-action: none`. Preserve this.

## Conventions
- Keep the styling vanilla: CSS variables in `:root`, dark mode via `body[data-theme="dark"]` overrides, system font stack (no web fonts).
- Standings header/footer rows are static in HTML and toggled with `hidden` when a list is empty (`#live-head`/`#live-foot`, `#alltime-head`/`#alltime-foot`).
