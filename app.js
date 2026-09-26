(() => {
  const STORAGE_KEY = "rally-pickleball-v1";
  const initialState = {
    players: [],
    matches: [],
    sessions: [],
    game: { left: 0, right: 0, serving: "left", server: 1, mode: "doubles", matchId: null, leftLabel: "HOME", rightLabel: "AWAY", winner: null, startedAt: null, durationMs: 0 },
  };

  let state = loadState();
  let scoreHistory = [];
  let toastTimer;
  let playerModalTimer;
  let sessionModalTimer;
  let timerInterval;
  let nextMatchId = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const leftScoreNode = $("#left-score");
  const rightScoreNode = $("#right-score");

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.matches)) return structuredClone(initialState);
      const game = { ...initialState.game, ...(saved.game || {}) };
      if (!isWinningScore(game)) {
        game.durationMs = 0;
        if (!game.matchId) game.startedAt = null;
      }
      return {
        players: saved.players,
        matches: saved.matches,
        sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
        game,
      };
    } catch {
      return structuredClone(initialState);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast("Could not save on this device. Check browser storage settings.");
    }
  }

  function id() {
    return globalThis.crypto?.randomUUID?.() || `rally-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function playerName(playerId) {
    return state.players.find((player) => player.id === playerId)?.name || "Player removed";
  }

  function namesForMatch(match) {
    return {
      left: match.teamA.map(playerName).join(" / "),
      right: match.teamB.map(playerName).join(" / "),
    };
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function localDateISO(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateLabel(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  }

  function computeStandings(players, matches) {
    return players.map((player) => {
      let wins = 0;
      let losses = 0;
      matches.filter((match) => match.completed).forEach((match) => {
        const isA = match.teamA.includes(player.id);
        const isB = match.teamB.includes(player.id);
        if (!isA && !isB) return;
        const won = (isA && match.winner === "A") || (isB && match.winner === "B");
        if (won) wins += 1;
        else losses += 1;
      });
      const played = wins + losses;
      return { player, wins, losses, rate: played ? wins / played : 0, played };
    }).sort((a, b) => b.rate - a.rate || b.wins - a.wins || a.player.name.localeCompare(b.player.name));
  }

  function buildStandingsList(container, standings, onSelect, options = {}) {
    const showGames = Boolean(options.showGames);
    if (!standings.length) {
      container.innerHTML = '<p class="standings-empty">No standings yet.</p>';
      return;
    }
    container.replaceChildren(...standings.map((entry, index) => {
      const row = document.createElement("div");
      row.className = `standing-row${showGames ? " has-games" : ""}`;
      if (onSelect) {
        row.dataset.playerId = entry.player.id;
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `View ${entry.player.name} match history`);
      }
      const player = document.createElement("div");
      player.className = "standing-player";
      const rank = document.createElement("span");
      const medals = ["🥇", "🥈", "🥉"];
      if (index < 3) {
        rank.className = "rank-medal";
        rank.textContent = medals[index];
        rank.setAttribute("aria-label", ["1st place", "2nd place", "3rd place"][index]);
      } else {
        rank.className = "rank-number";
        rank.textContent = String(index + 1).padStart(2, "0");
      }
      const name = document.createElement("span");
      name.textContent = entry.player.name;
      player.append(rank, name);
      const record = document.createElement("span");
      record.className = "record";
      record.textContent = `${entry.wins}—${entry.losses}`;
      const rate = document.createElement("span");
      rate.className = "win-rate";
      const percent = document.createElement("strong");
      percent.textContent = `${Math.round(entry.rate * 100)}%`;
      rate.append(percent);
      row.append(player, record, rate);
      if (showGames) {
        const games = document.createElement("span");
        games.className = "games";
        games.textContent = String(entry.played);
        row.append(games);
      }
      return row;
    }));
  }

  function gameElapsedMs(game = state.game) {
    if (game.durationMs) return game.durationMs;
    if (game.startedAt) return Date.now() - game.startedAt;
    return 0;
  }

  function stopGameTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function syncGameTimer() {
    const timerNode = $("#game-timer");
    if (timerNode) timerNode.textContent = formatTime(gameElapsedMs());
    stopGameTimer();
    if (state.game.startedAt && !winnerSide()) {
      timerInterval = setInterval(() => {
        const node = $("#game-timer");
        if (node) node.textContent = formatTime(gameElapsedMs());
      }, 1000);
    }
  }

  function renderDigit(scoreNode, value, animate = false) {
    const formatted = String(Math.max(0, value)).padStart(2, "0").slice(-2);
    const previous = scoreNode.dataset.value || "00";
    scoreNode.setAttribute("aria-label", String(value));
    scoreNode.dataset.value = formatted;
    if (previous === formatted && scoreNode.children.length) return;
    scoreNode.replaceChildren();
    [...formatted].forEach((digit, index) => {
      const oldDigit = previous[index] || "0";
      const shouldFlip = animate && oldDigit !== digit;
      const cell = document.createElement("span");
      cell.className = "flap-digit";
      const top = document.createElement("span");
      top.className = "digit-half digit-top";
      const topText = document.createElement("span");
      topText.textContent = digit;
      top.append(topText);
      const bottom = document.createElement("span");
      bottom.className = "digit-half digit-bottom";
      const bottomText = document.createElement("span");
      bottomText.textContent = shouldFlip ? oldDigit : digit;
      bottom.append(bottomText);
      cell.append(top, bottom);

      if (shouldFlip) {
        cell.style.setProperty("--flip-stagger", `${index * 70}ms`);
        const upperFlap = document.createElement("span");
        upperFlap.className = "flap flap-top";
        const upperText = document.createElement("span");
        upperText.textContent = oldDigit;
        upperFlap.append(upperText);
        const lowerFlap = document.createElement("span");
        lowerFlap.className = "flap flap-bottom";
        const lowerText = document.createElement("span");
        lowerText.textContent = digit;
        lowerFlap.append(lowerText);
        cell.append(upperFlap, lowerFlap);

        let fallbackTimer;
        const finishFlip = () => {
          clearTimeout(fallbackTimer);
          if (!cell.isConnected) return;
          bottomText.textContent = digit;
          upperFlap.remove();
          lowerFlap.remove();
          cell.classList.remove("is-flipping");
        };
        lowerFlap.addEventListener("animationend", finishFlip, { once: true });
        fallbackTimer = setTimeout(finishFlip, 780 + index * 70);
        requestAnimationFrame(() => cell.classList.add("is-flipping"));
      }
      scoreNode.append(cell);
    });
  }

  function isWinningScore(game) {
    return game.left >= 11 || game.right >= 11;
  }

  function winnerSide(game = state.game) {
    if (!isWinningScore(game)) return null;
    return game.left > game.right ? "left" : "right";
  }

  function teamDisplayName(side) {
    const game = state.game;
    if (side === "left") return game.leftLabel || "HOME";
    return game.rightLabel || "AWAY";
  }

  function renderGame(animate = false) {
    const game = state.game;
    renderDigit(leftScoreNode, game.left, animate);
    renderDigit(rightScoreNode, game.right, animate);
    leftScoreNode.setAttribute("aria-label", `Left side score: ${game.left}. Tap to add a point; two-finger tap to subtract.`);
    rightScoreNode.setAttribute("aria-label", `Right side score: ${game.right}. Tap to add a point; two-finger tap to subtract.`);
    $("#left-team-name").textContent = game.leftLabel || "HOME";
    $("#right-team-name").textContent = game.rightLabel || "AWAY";
    $("#service-number").textContent = game.mode === "singles" ? "—" : String(game.server);
    $("#service-number").disabled = game.mode === "singles";
    $("#service-number").setAttribute("aria-label", game.mode === "singles" ? "Server switching is available in doubles." : `Server ${game.server}. Tap to switch server.`);
    $("#service-caption").textContent = game.mode === "singles" ? "SINGLES" : "OF 2";
    $("#score-call").textContent = game.mode === "singles"
      ? `${game.left} — ${game.right}`
      : `${game.left} — ${game.right} — ${game.server}`;
    $("#left-serve-badge").hidden = game.serving !== "left";
    $("#right-serve-badge").hidden = game.serving !== "right";
    $(".left-team").classList.toggle("serving", game.serving === "left");
    $(".right-team").classList.toggle("serving", game.serving === "right");
    $$('[data-serving]').forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.serving === game.serving)));
    $$(".format-button").forEach((button) => {
      const active = button.dataset.mode === game.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#server-toggle").hidden = game.mode === "singles";
    $("#server-toggle").setAttribute("aria-label", `Switch to server ${game.server === 1 ? 2 : 1}`);
    $$("#server-toggle strong").forEach((item) => item.classList.toggle("selected", Number(item.textContent) === game.server));
    $("#status-text").textContent = winnerSide() ? "GAME COMPLETE" : "GAME IN PROGRESS";
    $("#undo-button").disabled = scoreHistory.length === 0;
    const selectedMatch = state.matches.find((match) => match.id === game.matchId);
    const finalize = $("#finalize-button");
    finalize.hidden = !selectedMatch || selectedMatch.completed || !winnerSide();
    syncGameTimer();
  }

  function startTesterGame() {
    if (state.game.matchId || state.game.left > 0 || state.game.right > 0) {
      const proceed = window.confirm("Start a fresh score card? This clears the current score and detaches from any match.");
      if (!proceed) return;
    }
    resetGame({ keepMatch: false });
    showToast("Score card tester ready — not tied to a match.");
  }

  function resetGame({ keepMatch = false, startTimer = true } = {}) {
    const previous = state.game;
    state.game = {
      ...initialState.game,
      mode: previous.mode,
      matchId: keepMatch ? previous.matchId : null,
      leftLabel: keepMatch ? previous.leftLabel : "HOME",
      rightLabel: keepMatch ? previous.rightLabel : "AWAY",
      startedAt: startTimer ? Date.now() : null,
    };
    scoreHistory = [];
    saveState();
    renderGame();
  }

  function updateScore(side, change) {
    const game = state.game;
    if (winnerSide()) {
      showToast("This game is complete. Finalize the result or reset the score.");
      return;
    }
    if (change < 0 && game[side] === 0) return;
    scoreHistory.push({ ...game });
    game[side] = Math.max(0, Math.min(99, game[side] + change));
    if (winnerSide() && !game.durationMs) game.durationMs = Date.now() - (game.startedAt || Date.now());
    renderGame(true);
    if (winnerSide()) openResultDialog();
    saveState();
  }

  function revertScore(side) {
    const game = state.game;
    if (game[side] === 0) return;
    scoreHistory.push({ ...game });
    game[side] = Math.max(0, game[side] - 1);
    if (!winnerSide()) game.durationMs = 0;
    renderGame(true);
    saveState();
  }

  function undoPoint() {
    const previous = scoreHistory.pop();
    if (!previous) return false;
    state.game = previous;
    saveState();
    renderGame(true);
    return true;
  }

  function openResultDialog() {
    const side = winnerSide();
    if (!side) return;
    const score = `${state.game.left} — ${state.game.right}`;
    const elapsed = gameElapsedMs();
    $("#result-title").textContent = `${teamDisplayName(side)} wins!`;
    $("#result-summary").textContent = elapsed ? `${score} · ${formatTime(elapsed)}` : `${score}`;
    const match = state.matches.find((item) => item.id === state.game.matchId);
    $("#dialog-finalize").hidden = !match || match.completed;
    $("#dialog-next").hidden = !match || match.completed || !nextUncompletedMatch(state.game.matchId);
    const dialog = $("#result-dialog");
    if (!dialog.open) {
      dialog.showModal();
    }
  }

  function nextUncompletedMatch(excludeId) {
    return state.matches.find((match) => !match.completed && match.id !== excludeId) || null;
  }

  function openNextMatch() {
    const match = nextUncompletedMatch(state.game.matchId);
    if (!match) {
      showToast("No more matches in the schedule.");
      return;
    }
    buildMatchup($("#next-matchup"), namesForMatch(match), match.mode);
    $("#next-mode").textContent = match.mode === "doubles" ? "Doubles · 2 vs 2" : "Singles · 1 vs 1";
    nextMatchId = match.id;
    const dialog = $("#next-match-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function finalizeMatch() {
    const game = state.game;
    const match = state.matches.find((item) => item.id === game.matchId);
    const side = winnerSide();
    if (!match || !side || match.completed) return;
    match.scoreA = game.left;
    match.scoreB = game.right;
    match.winner = side === "left" ? "A" : "B";
    match.completed = true;
    match.completedAt = new Date().toISOString();
    match.startedAt = game.startedAt || null;
    match.endedAt = Date.now();
    match.durationSeconds = Math.round(gameElapsedMs() / 1000) || null;
    saveState();
    $("#result-dialog").close();
    renderMatches();
    renderStandings();
    renderGame();
    showToast("Match finalized. Standings are up to date.");
  }

  function switchView(viewId) {
    $$(".view").forEach((view) => { view.hidden = view.id !== viewId; });
    $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
    const shownView = document.getElementById(viewId);
    if (shownView) {
      shownView.classList.remove("view-anim");
      void shownView.offsetWidth;
      shownView.classList.add("view-anim");
    }
    if (viewId === "session-view") {
      renderPlayers();
      renderMatches();
      renderStandings();
    }
    if (viewId === "sessions-view") {
      renderSessions();
    }
    if (viewId === "alltime-view") {
      renderAllTime();
    }
  }

  function renderPlayers() {
    const list = $("#player-list");
    $("#player-count").textContent = `${state.players.length} PLAYER${state.players.length === 1 ? "" : "S"}`;
    if (!state.players.length) {
      list.innerHTML = '<p class="empty-inline">Your player list will show up here.</p>';
      return;
    }
    list.replaceChildren(...state.players.map((player) => {
      const chip = document.createElement("span");
      chip.className = "player-chip";
      const name = document.createElement("span");
      name.textContent = player.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.removePlayer = player.id;
      remove.setAttribute("aria-label", `Remove ${player.name}`);
      remove.textContent = "×";
      chip.append(name, remove);
      return chip;
    }));
  }

  function shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  }

  function draftSingles(players) {
    const matches = [];
    for (let left = 0; left < players.length; left += 1) {
      for (let right = left + 1; right < players.length; right += 1) {
        matches.push({ id: id(), mode: "singles", teamA: [players[left].id], teamB: [players[right].id], completed: false });
      }
    }
    return shuffle(matches);
  }

  function draftDoubles(players) {
    const shuffled = shuffle(players);
    const teams = [];
    for (let index = 0; index < shuffled.length; index += 2) {
      teams.push([shuffled[index].id, shuffled[index + 1].id]);
    }
    const matches = [];
    for (let left = 0; left < teams.length; left += 1) {
      for (let right = left + 1; right < teams.length; right += 1) {
        matches.push({ id: id(), mode: "doubles", teamA: teams[left], teamB: teams[right], completed: false });
      }
    }
    return shuffle(matches);
  }

  function draftMatches() {
    const mode = $("#draft-mode").value;
    if (mode === "singles" && state.players.length < 2) {
      showToast("Add at least 2 players to draft singles matches.");
      return;
    }
    if (mode === "doubles" && (state.players.length < 4 || state.players.length % 2 !== 0)) {
      showToast("Doubles needs at least 4 players and an even roster.");
      return;
    }
    const newMatches = mode === "singles" ? draftSingles(state.players) : draftDoubles(state.players);
    state.matches = [...state.matches.filter((match) => match.completed), ...newMatches];
    saveState();
    renderMatches();
    showToast(`${newMatches.length} ${mode} match${newMatches.length === 1 ? "" : "es"} drafted.`);
  }

  function renderMatches() {
    const list = $("#matches-list");
    const matches = [...state.matches];
    $("#match-count").textContent = `${matches.length} MATCH${matches.length === 1 ? "" : "ES"}`;
    if (!matches.length) {
      list.innerHTML = '<div class="empty-state"><span class="empty-symbol">↗</span><strong>No matches drafted yet</strong><span>Add your players above, then draft a schedule.</span></div>';
      return;
    }
    list.replaceChildren(...matches.map((match, index) => {
      const names = namesForMatch(match);
      const card = document.createElement("article");
      card.className = `match-card${match.completed ? " completed" : ""}`;
      const mode = document.createElement("span");
      mode.className = "match-mode";
      mode.textContent = match.mode === "doubles" ? "Doubles" : "Singles";
      const left = document.createElement("div");
      left.className = "match-team";
      const leftLabel = document.createElement("small");
      leftLabel.textContent = match.mode === "doubles" ? "TEAM A" : "PLAYER A";
      const leftNames = document.createElement("span");
      leftNames.textContent = names.left;
      left.append(leftLabel, leftNames);
      const versus = document.createElement("span");
      versus.className = "match-versus";
      versus.textContent = "VS";
      const right = document.createElement("div");
      right.className = "match-team right";
      const rightLabel = document.createElement("small");
      rightLabel.textContent = match.mode === "doubles" ? "TEAM B" : "PLAYER B";
      const rightNames = document.createElement("span");
      rightNames.textContent = names.right;
      right.append(rightLabel, rightNames);
      const action = document.createElement("button");
      action.className = "match-action";
      action.type = "button";
      action.dataset.matchId = match.id;
      action.dataset.completed = match.completed ? "1" : "0";
      action.textContent = match.completed ? "View score" : "Play match";
      card.append(mode, left, versus, right, action);
      if (match.completed) {
        const result = document.createElement("div");
        result.className = "match-result";
        const durationTag = match.durationSeconds ? `  ·  ${formatTime(match.durationSeconds * 1000)}` : "";
        result.textContent = `FINAL  ${match.scoreA} — ${match.scoreB}  ·  ${match.winner === "A" ? names.left : names.right} WON${durationTag}`;
        card.append(result);
      } else {
        card.dataset.order = String(index + 1);
      }
      return card;
    }));
  }

  function renderStandings() {
    const list = $("#standings-list");
    const standings = computeStandings(state.players, state.matches).filter((entry) => entry.played > 0);
    const hasStandings = standings.length > 0;
    const note = $("#standings-note");
    const head = $("#live-head");
    const foot = $("#live-foot");
    if (note) note.hidden = !hasStandings;
    if (head) head.hidden = !hasStandings;
    if (foot) foot.hidden = !hasStandings;
    if (!hasStandings) {
      list.innerHTML = '<div class="standings-empty">No results yet — finalize a match to see standings.</div>';
      return;
    }
    buildStandingsList(list, standings, true);
  }

  function buildAllTimeContext() {
    const playersById = new Map();
    state.players.forEach((player) => playersById.set(player.id, { ...player }));
    const matches = [...state.matches.filter((match) => match.completed)];
    state.sessions.forEach((session) => {
      session.players.forEach((player) => {
        if (!playersById.has(player.id)) playersById.set(player.id, { ...player });
      });
      session.matches.forEach((match) => {
        matches.push(match);
      });
    });
    return { players: [...playersById.values()], matches };
  }

  function renderAllTime() {
    const list = $("#alltime-standings");
    const context = buildAllTimeContext();
    const standings = computeStandings(context.players, context.matches).filter((entry) => entry.played > 0);
    const hasStandings = standings.length > 0;
    const head = $("#alltime-head");
    const foot = $("#alltime-foot");
    if (head) head.hidden = !hasStandings;
    if (foot) foot.hidden = !hasStandings;
    if (!hasStandings) {
      list.innerHTML = '<div class="standings-empty">No results yet. Play and finalize matches (or wrap up a day) to build your all-time record.</div>';
      return;
    }
    buildStandingsList(list, standings, true, { showGames: true });
  }

  function getPlayerHistory(players, matches, playerId) {
    const nameOf = (id) => players.find((player) => player.id === id)?.name || "Player";
    const groups = new Map();
    matches.filter((match) => match.completed).forEach((match) => {
      const inA = match.teamA.includes(playerId);
      const inB = match.teamB.includes(playerId);
      if (!inA && !inB) return;
      const myTeam = inA ? match.teamA : match.teamB;
      const otherTeam = inA ? match.teamB : match.teamA;
      const partners = myTeam.filter((memberId) => memberId !== playerId);
      const counterparts = partners.length ? partners : otherTeam;
      const label = partners.length ? "Partner" : "Opponent";
      const won = (inA && match.winner === "A") || (inB && match.winner === "B");
      counterparts.forEach((mateId) => {
        if (!groups.has(mateId)) groups.set(mateId, { mateId, label, wins: 0, losses: 0 });
        const entry = groups.get(mateId);
        if (won) entry.wins += 1;
        else entry.losses += 1;
      });
    });
    return [...groups.values()].map((entry) => {
      const played = entry.wins + entry.losses;
      return { ...entry, played, rate: played ? entry.wins / played : 0 };
    }).sort((a, b) => b.rate - a.rate || b.wins - a.wins || nameOf(a.mateId).localeCompare(nameOf(b.mateId)));
  }

  function openPlayerModal(playerId, context) {
    const players = context?.players || state.players;
    const matches = context?.matches || state.matches;
    const nameOf = (id) => players.find((player) => player.id === id)?.name || "Player";
    const player = players.find((item) => item.id === playerId);
    if (!player) return;
    const history = getPlayerHistory(players, matches, playerId);
    const totals = history.reduce((acc, entry) => ({ wins: acc.wins + entry.wins, losses: acc.losses + entry.losses }), { wins: 0, losses: 0 });
    const played = totals.wins + totals.losses;
    const rate = played ? Math.round((totals.wins / played) * 100) : 0;
    const playerMatches = matches.filter((match) => match.completed && (match.teamA.includes(playerId) || match.teamB.includes(playerId)));
    const durations = playerMatches.map((match) => match.durationSeconds).filter((value) => typeof value === "number" && value > 0);
    const avgSeconds = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
    $("#player-modal-name").textContent = player.name;
    $("#player-modal-record").textContent = played
      ? `${totals.wins}W — ${totals.losses}L · ${rate}% win rate · ${played} game${played === 1 ? "" : "s"}${avgSeconds ? ` · avg ${formatTime(avgSeconds * 1000)}` : ""}`
      : "No finalized matches yet";
    const body = $("#player-modal-body");
    if (!history.length) {
      body.innerHTML = '<p class="player-modal-empty">No match history yet. Finalize a match to see results with each partner and opponent here.</p>';
    } else {
      body.replaceChildren(...history.map((entry) => {
        const row = document.createElement("div");
        row.className = "partner-row";
        const info = document.createElement("div");
        info.className = "partner-info";
        const name = document.createElement("span");
        name.className = "partner-name";
        name.textContent = nameOf(entry.mateId);
        const tag = document.createElement("span");
        tag.className = "partner-tag";
        tag.textContent = entry.label;
        info.append(name, tag);
        const record = document.createElement("span");
        record.className = "partner-record";
        record.textContent = `${entry.wins}W — ${entry.losses}L`;
        const rateCell = document.createElement("span");
        rateCell.className = "partner-rate";
        const percent = document.createElement("strong");
        percent.textContent = `${Math.round(entry.rate * 100)}%`;
        rateCell.append(percent);
        row.append(info, record, rateCell);
        return row;
      }));
    }
    const modal = $("#player-modal");
    clearTimeout(playerModalTimer);
    modal.hidden = false;
    modal.dataset.playerId = playerId;
    void modal.offsetWidth;
    modal.classList.add("open");
  }

  function closePlayerModal() {
    const modal = $("#player-modal");
    if (modal.hidden) return;
    modal.classList.remove("open");
    clearTimeout(playerModalTimer);
    playerModalTimer = setTimeout(() => { modal.hidden = true; }, 260);
  }

  function namesForMatchIn(players, match) {
    const nameOf = (playerId) => players.find((player) => player.id === playerId)?.name || "Player";
    return {
      left: match.teamA.map(nameOf).join(" / "),
      right: match.teamB.map(nameOf).join(" / "),
    };
  }

  function buildMatchup(container, names, mode) {
    container.replaceChildren();
    const buildTeam = (label, nameText, right) => {
      const team = document.createElement("div");
      team.className = `next-team${right ? " right" : ""}`;
      const small = document.createElement("small");
      small.textContent = label;
      const span = document.createElement("span");
      span.textContent = nameText;
      team.append(small, span);
      return team;
    };
    const versus = document.createElement("span");
    versus.className = "next-vs";
    versus.textContent = "VS";
    container.append(
      buildTeam(mode === "doubles" ? "TEAM A" : "PLAYER A", names.left, false),
      versus,
      buildTeam(mode === "doubles" ? "TEAM B" : "PLAYER B", names.right, true),
    );
  }

  function openViewMatchModal(matchId) {
    const match = state.matches.find((item) => item.id === matchId);
    if (!match) return;
    const names = namesForMatch(match);
    buildMatchup($("#view-matchup"), names, match.mode);
    $("#view-score").textContent = `${match.scoreA} — ${match.scoreB}`;
    const winner = match.winner === "A" ? names.left : names.right;
    const modeText = match.mode === "doubles" ? "Doubles" : "Singles";
    const durationText = match.durationSeconds ? ` · ${formatTime(match.durationSeconds * 1000)}` : "";
    $("#view-details").textContent = `${winner} won · ${modeText}${durationText}`;
    $("#view-times").textContent = `Started ${formatDateTime(match.startedAt)} · Ended ${formatDateTime(match.endedAt)}`;
    const dialog = $("#view-match-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function openWrapUpConfirm() {
    const completed = state.matches.filter((match) => match.completed);
    const incomplete = state.matches.filter((match) => !match.completed);
    if (!completed.length) {
      showToast("Nothing to wrap up yet — no finalized matches.");
      return;
    }
    const matchWord = completed.length === 1 ? "match" : "matches";
    let message = `Wrap up ${completed.length} finalized ${matchWord}?`;
    if (incomplete.length) {
      message += ` ${incomplete.length} unplayed match${incomplete.length === 1 ? "" : "es"} will stay on the schedule.`;
    }
    $("#confirm-wrapup-text").textContent = message;
    const dialog = $("#confirm-wrapup-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function wrapUpSession() {
    const completed = state.matches.filter((match) => match.completed);
    const incomplete = state.matches.filter((match) => !match.completed);
    if (!completed.length) return;
    const now = new Date();
    state.sessions.push({
      id: id(),
      dateISO: localDateISO(now),
      wrappedAt: now.getTime(),
      players: state.players.map((player) => ({ ...player })),
      matches: completed.map((match) => ({ ...match, teamA: [...match.teamA], teamB: [...match.teamB] })),
    });
    state.matches = incomplete;
    if (state.game.matchId && !incomplete.some((match) => match.id === state.game.matchId)) {
      resetGame({ keepMatch: false, startTimer: false });
    }
    saveState();
    renderMatches();
    renderStandings();
    renderSessions();
    showToast(`Wrapped up ${completed.length} match${completed.length === 1 ? "" : "es"}.`);
  }

  function openClearConfirm() {
    const total = state.matches.length;
    if (!total) {
      showToast("Nothing to clear — the schedule is already empty.");
      return;
    }
    $("#confirm-clear-text").textContent = `This removes all ${total} match${total === 1 ? "" : "es"}, including finalized results. You can draft a new schedule afterward.`;
    const dialog = $("#confirm-clear-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function clearSchedule() {
    state.matches = [];
    if (state.game.matchId) {
      resetGame({ keepMatch: false, startTimer: false });
    }
    saveState();
    renderMatches();
    renderStandings();
    showToast("Schedule cleared.");
  }

  function renderSessions() {
    const list = $("#sessions-list");
    const sessions = [...state.sessions].sort((a, b) => b.wrappedAt - a.wrappedAt);
    if (!sessions.length) {
      list.innerHTML = '<div class="sessions-empty"><span class="empty-symbol">◷</span><strong>No wrapped-up sessions yet</strong><span>Wrap up a day from Players &amp; matches to archive it here.</span></div>';
      return;
    }
    const groups = new Map();
    sessions.forEach((session) => {
      if (!groups.has(session.dateISO)) groups.set(session.dateISO, []);
      groups.get(session.dateISO).push(session);
    });
    list.replaceChildren(...[...groups.entries()].map(([dateISO, daySessions]) => {
      const group = document.createElement("div");
      group.className = "session-group";
      const heading = document.createElement("p");
      heading.className = "session-date";
      heading.textContent = dateLabel(dateISO);
      group.append(heading);
      daySessions.forEach((session) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "session-card";
        card.dataset.sessionId = session.id;
        const main = document.createElement("div");
        main.className = "session-card-main";
        const title = document.createElement("span");
        title.className = "session-card-title";
        const time = new Date(session.wrappedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        title.textContent = `Wrapped at ${time}`;
        const meta = document.createElement("span");
        meta.className = "session-card-meta";
        meta.textContent = `${session.matches.length} match${session.matches.length === 1 ? "" : "es"} · ${session.players.length} players`;
        main.append(title, meta);
        const chevron = document.createElement("span");
        chevron.className = "session-card-chevron";
        chevron.textContent = "›";
        card.append(main, chevron);
        group.append(card);
      });
      return group;
    }));
  }

  function openSessionModal(sessionId) {
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const time = new Date(session.wrappedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    $("#session-modal-title").textContent = dateLabel(session.dateISO);
    $("#session-modal-record").textContent = `${session.matches.length} match${session.matches.length === 1 ? "" : "es"} · wrapped at ${time}`;
    const matchesHost = $("#session-modal-matches");
    matchesHost.replaceChildren(...session.matches.map((match) => {
      const names = namesForMatchIn(session.players, match);
      const row = document.createElement("div");
      row.className = "session-match";
      const left = document.createElement("span");
      left.className = "sm-team";
      left.textContent = names.left;
      const score = document.createElement("span");
      score.className = "sm-score";
      score.textContent = `${match.scoreA} — ${match.scoreB}`;
      const right = document.createElement("span");
      right.className = "sm-team right";
      right.textContent = names.right;
      const winner = document.createElement("span");
      winner.className = "sm-winner";
      const winnerName = match.winner === "A" ? names.left : names.right;
      const durationText = match.durationSeconds ? ` · ${formatTime(match.durationSeconds * 1000)}` : "";
      winner.textContent = `${winnerName} won · ${match.mode === "doubles" ? "Doubles" : "Singles"}${durationText}`;
      row.append(left, score, right, winner);
      return row;
    }));
    buildStandingsList($("#session-modal-standings"), computeStandings(session.players, session.matches), true);
    const modal = $("#session-modal");
    clearTimeout(sessionModalTimer);
    modal.hidden = false;
    modal.dataset.sessionId = sessionId;
    void modal.offsetWidth;
    modal.classList.add("open");
  }

  function closeSessionModal() {
    const modal = $("#session-modal");
    if (modal.hidden) return;
    modal.classList.remove("open");
    clearTimeout(sessionModalTimer);
    sessionModalTimer = setTimeout(() => { modal.hidden = true; }, 260);
  }

  function deleteSession(sessionId) {
    const index = state.sessions.findIndex((item) => item.id === sessionId);
    if (index === -1) return;
    state.sessions.splice(index, 1);
    saveState();
    renderSessions();
  }

  function loadMatch(matchId) {
    const match = state.matches.find((item) => item.id === matchId);
    if (!match) return;
    const names = namesForMatch(match);
    state.game = {
      ...initialState.game,
      left: match.completed ? match.scoreA : 0,
      right: match.completed ? match.scoreB : 0,
      mode: match.mode,
      matchId: match.id,
      leftLabel: names.left,
      rightLabel: names.right,
      winner: match.completed ? match.winner : null,
      startedAt: match.completed ? null : Date.now(),
    };
    scoreHistory = [];
    saveState();
    renderGame();
    switchView("score-view");
    if (match.completed) showToast("Viewing finalized match score.");
  }

  $(".main-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) switchView(button.dataset.view);
  });

  $$(".format-button").forEach((button) => button.addEventListener("click", () => {
    if (state.game.matchId) {
      const match = state.matches.find((item) => item.id === state.game.matchId);
      if (match && !match.completed) {
        showToast("Match format is set by the drafted match.");
        return;
      }
    }
    state.game.mode = button.dataset.mode;
    saveState();
    renderGame();
  }));

  const scoreTouches = { left: new Set(), right: new Set() };
  const scoreMulti = { left: false, right: false };
  const clickSuppressUntil = { left: 0, right: 0 };

  $$("[data-score-tap]").forEach((button) => {
    const side = button.dataset.scoreTap;
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      scoreTouches[side].add(event.pointerId);
      if (scoreTouches[side].size >= 2) {
        scoreMulti[side] = true;
        clickSuppressUntil[side] = Date.now() + 600;
      }
    });
    button.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse") return;
      scoreTouches[side].delete(event.pointerId);
      if (scoreTouches[side].size === 0) {
        const multi = scoreMulti[side];
        scoreMulti[side] = false;
        if (multi) {
          revertScore(side);
        } else {
          updateScore(side, 1);
          clickSuppressUntil[side] = Date.now() + 600;
        }
      }
    });
    button.addEventListener("pointercancel", (event) => {
      if (event.pointerType === "mouse") return;
      scoreTouches[side].delete(event.pointerId);
      if (scoreTouches[side].size === 0) scoreMulti[side] = false;
    });
    button.addEventListener("click", (event) => {
      if (Date.now() < clickSuppressUntil[side]) {
        event.preventDefault();
        return;
      }
      updateScore(side, 1);
    });
  });
  $$("[data-score]").forEach((button) => button.addEventListener("click", () => {
    updateScore(button.dataset.score, Number(button.dataset.change));
  }));
  $$("[data-serving]").forEach((button) => button.addEventListener("click", () => {
    state.game.serving = button.dataset.serving;
    if (state.game.mode === "doubles") state.game.server = 1;
    saveState();
    renderGame();
  }));
  function toggleServer() {
    if (state.game.mode === "singles") return;
    state.game.server = state.game.server === 1 ? 2 : 1;
    saveState();
    renderGame();
  }
  $("#server-toggle").addEventListener("click", toggleServer);
  $("#service-number").addEventListener("click", toggleServer);
  $("#undo-button").addEventListener("click", () => {
    undoPoint();
  });
  $("#reset-button").addEventListener("click", () => {
    if (state.game.left || state.game.right) {
      const confirmed = window.confirm("Reset both scores to zero?");
      if (!confirmed) return;
    }
    resetGame({ keepMatch: true });
  });
  $("#tester-button").addEventListener("click", startTesterGame);
  $("#finalize-button").addEventListener("click", openResultDialog);
  $("#dialog-finalize").addEventListener("click", finalizeMatch);
  $("#dialog-next").addEventListener("click", () => {
    finalizeMatch();
    openNextMatch();
  });
  $("#close-result").addEventListener("click", () => $("#result-dialog").close());
  $("#result-dialog").addEventListener("click", (event) => {
    if (event.target === $("#result-dialog")) $("#result-dialog").close();
  });
  $("#next-cancel").addEventListener("click", () => $("#next-match-dialog").close());
  $("#next-start").addEventListener("click", () => {
    const match = state.matches.find((item) => item.id === nextMatchId);
    $("#next-match-dialog").close();
    if (match) loadMatch(match.id);
  });
  $("#next-match-dialog").addEventListener("click", (event) => {
    if (event.target === $("#next-match-dialog")) $("#next-match-dialog").close();
  });

  $("#player-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#player-name");
    const name = input.value.trim();
    if (!name) return;
    if (state.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      showToast("That player is already on the roster.");
      input.select();
      return;
    }
    state.players.push({ id: id(), name });
    input.value = "";
    saveState();
    renderPlayers();
    renderStandings();
    input.focus();
  });

  $("#player-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-player]");
    if (!button) return;
    const player = state.players.find((item) => item.id === button.dataset.removePlayer);
    if (!player) return;
    state.players = state.players.filter((item) => item.id !== player.id);
    state.matches = state.matches.filter((match) => match.completed || (!match.teamA.includes(player.id) && !match.teamB.includes(player.id)));
    saveState();
    renderPlayers();
    renderMatches();
    renderStandings();
    if (state.game.matchId && state.matches.some((match) => match.id === state.game.matchId)) loadMatch(state.game.matchId);
  });

  $("#draft-button").addEventListener("click", draftMatches);
  $("#wrapup-button").addEventListener("click", openWrapUpConfirm);
  $("#clear-schedule").addEventListener("click", openClearConfirm);
  $("#matches-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-match-id]");
    if (!button) return;
    if (button.dataset.completed === "1") openViewMatchModal(button.dataset.matchId);
    else loadMatch(button.dataset.matchId);
  });
  $("#view-close").addEventListener("click", () => $("#view-match-dialog").close());
  $("#view-match-dialog").addEventListener("click", (event) => {
    if (event.target === $("#view-match-dialog")) $("#view-match-dialog").close();
  });

  $("#standings-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-player-id]");
    if (row) openPlayerModal(row.dataset.playerId);
  });
  $("#standings-list").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-player-id]");
    if (!row) return;
    event.preventDefault();
    openPlayerModal(row.dataset.playerId);
  });
  $("#player-modal-close").addEventListener("click", closePlayerModal);
  $("#player-modal").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-player-modal]")) closePlayerModal();
  });

  $("#sessions-list").addEventListener("click", (event) => {
    const card = event.target.closest("[data-session-id]");
    if (card) openSessionModal(card.dataset.sessionId);
  });
  $("#session-modal-close").addEventListener("click", closeSessionModal);
  $("#session-modal").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-session-modal]")) closeSessionModal();
  });
  $("#session-delete").addEventListener("click", () => {
    const dialog = $("#confirm-delete-dialog");
    if (!dialog.open) dialog.showModal();
  });
  $("#confirm-delete-cancel").addEventListener("click", () => $("#confirm-delete-dialog").close());
  $("#confirm-delete-ok").addEventListener("click", () => {
    const sessionId = $("#session-modal").dataset.sessionId;
    $("#confirm-delete-dialog").close();
    closeSessionModal();
    if (sessionId) {
      deleteSession(sessionId);
      showToast("Session deleted.");
    }
  });
  $("#confirm-delete-dialog").addEventListener("click", (event) => {
    if (event.target === $("#confirm-delete-dialog")) $("#confirm-delete-dialog").close();
  });
  $("#confirm-wrapup-cancel").addEventListener("click", () => $("#confirm-wrapup-dialog").close());
  $("#confirm-wrapup-ok").addEventListener("click", () => {
    $("#confirm-wrapup-dialog").close();
    wrapUpSession();
  });
  $("#confirm-wrapup-dialog").addEventListener("click", (event) => {
    if (event.target === $("#confirm-wrapup-dialog")) $("#confirm-wrapup-dialog").close();
  });
  $("#confirm-clear-cancel").addEventListener("click", () => $("#confirm-clear-dialog").close());
  $("#confirm-clear-ok").addEventListener("click", () => {
    $("#confirm-clear-dialog").close();
    clearSchedule();
  });
  $("#confirm-clear-dialog").addEventListener("click", (event) => {
    if (event.target === $("#confirm-clear-dialog")) $("#confirm-clear-dialog").close();
  });

  $("#alltime-standings").addEventListener("click", (event) => {
    const row = event.target.closest("[data-player-id]");
    if (row) openPlayerModal(row.dataset.playerId, buildAllTimeContext());
  });
  $("#alltime-standings").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-player-id]");
    if (!row) return;
    event.preventDefault();
    openPlayerModal(row.dataset.playerId, buildAllTimeContext());
  });

  function openSessionPlayer(playerId) {
    const session = state.sessions.find((item) => item.id === $("#session-modal").dataset.sessionId);
    if (session) openPlayerModal(playerId, { players: session.players, matches: session.matches });
  }
  $("#session-modal-standings").addEventListener("click", (event) => {
    const row = event.target.closest("[data-player-id]");
    if (row) openSessionPlayer(row.dataset.playerId);
  });
  $("#session-modal-standings").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-player-id]");
    if (!row) return;
    event.preventDefault();
    openSessionPlayer(row.dataset.playerId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const nativeDialogOpen = ["confirm-delete-dialog", "confirm-wrapup-dialog", "confirm-clear-dialog", "view-match-dialog", "result-dialog", "next-match-dialog"]
      .some((dialogId) => document.getElementById(dialogId)?.open);
    if (nativeDialogOpen) return;
    if (!$("#player-modal").hidden) closePlayerModal();
    else closeSessionModal();
  });

  $(".orientation-button").addEventListener("click", () => {
    const rotated = document.body.classList.toggle("manual-landscape");
    $(".orientation-button").setAttribute("aria-label", rotated ? "Return to portrait orientation" : "Rotate screen");
    $(".orientation-button").title = rotated ? "Return to portrait" : "Rotate screen";
  });

  const fullscreenButton = $("#fullscreen-button");
  const exitFullscreenButton = $("#exit-fullscreen");

  function isFullscreenActive() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function enterFullscreen() {
    document.body.classList.add("fullscreen-mode");
    exitFullscreenButton.hidden = false;
    const element = document.documentElement;
    const request = element.requestFullscreen || element.webkitRequestFullscreen;
    if (!request) return;
    try {
      const result = request.call(element);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch { /* fall back to the CSS landscape view */ }
  }

  function exitFullscreen() {
    document.body.classList.remove("fullscreen-mode");
    exitFullscreenButton.hidden = true;
    if (!isFullscreenActive()) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return;
    try {
      const result = exit.call(document);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch { /* ignore */ }
  }

  function toggleFullscreen() {
    if (document.body.classList.contains("fullscreen-mode")) exitFullscreen();
    else enterFullscreen();
  }

  fullscreenButton.addEventListener("click", toggleFullscreen);
  exitFullscreenButton.addEventListener("click", exitFullscreen);

  ["fullscreenchange", "webkitfullscreenchange"].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (!isFullscreenActive() && document.body.classList.contains("fullscreen-mode")) {
        document.body.classList.remove("fullscreen-mode");
        exitFullscreenButton.hidden = true;
      }
    });
  });

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const button = $("#theme-button");
    if (!button) return;
    const dark = theme === "dark";
    button.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  let theme = "light";
  try { theme = localStorage.getItem("anong-theme") || "light"; } catch { theme = "light"; }
  applyTheme(theme);
  $("#theme-button").addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("anong-theme", theme); } catch { /* ignore */ }
    applyTheme(theme);
  });

  renderGame();
  renderPlayers();
  renderMatches();
  renderStandings();
  renderSessions();
  renderAllTime();

  const brandMark = $(".brand-mark");
  if (brandMark) {
    brandMark.classList.add("spin");
    brandMark.addEventListener("animationend", function handleBrandSpin(event) {
      if (event.animationName !== "brand-spin") return;
      brandMark.classList.remove("spin");
      brandMark.removeEventListener("animationend", handleBrandSpin);
    });
  }
})();
