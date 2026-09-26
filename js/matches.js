(() => {
  const App = (window.App = window.App || {});

  App.renderPlayers = function renderPlayers() {
    const list = App.$("#player-list");
    App.$("#player-count").textContent = `${App.state.players.length} PLAYER${App.state.players.length === 1 ? "" : "S"}`;
    if (!App.state.players.length) {
      list.innerHTML = '<p class="empty-inline">Your player list will show up here.</p>';
      return;
    }
    list.replaceChildren(...App.state.players.map((player) => {
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
  };

  App.shuffle = function shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  };

  App.draftSingles = function draftSingles(players) {
    const matches = [];
    for (let left = 0; left < players.length; left += 1) {
      for (let right = left + 1; right < players.length; right += 1) {
        matches.push({ id: App.id(), mode: "singles", teamA: [players[left].id], teamB: [players[right].id], completed: false });
      }
    }
    return App.shuffle(matches);
  };

  App.draftDoubles = function draftDoubles(players) {
    const shuffled = App.shuffle(players);
    const teams = [];
    for (let index = 0; index < shuffled.length; index += 2) {
      teams.push([shuffled[index].id, shuffled[index + 1].id]);
    }
    const matches = [];
    for (let left = 0; left < teams.length; left += 1) {
      for (let right = left + 1; right < teams.length; right += 1) {
        matches.push({ id: App.id(), mode: "doubles", teamA: teams[left], teamB: teams[right], completed: false });
      }
    }
    return App.shuffle(matches);
  };

  App.draftMatches = function draftMatches() {
    const mode = App.$("#draft-mode").value;
    if (mode === "singles" && App.state.players.length < 2) {
      App.showToast("Add at least 2 players to draft singles matches.");
      return;
    }
    if (mode === "doubles" && (App.state.players.length < 4 || App.state.players.length % 2 !== 0)) {
      App.showToast("Doubles needs at least 4 players and an even roster.");
      return;
    }
    const newMatches = mode === "singles" ? App.draftSingles(App.state.players) : App.draftDoubles(App.state.players);
    App.state.matches = [...App.state.matches.filter((match) => match.completed), ...newMatches];
    App.saveState();
    App.renderMatches();
    App.showToast(`${newMatches.length} ${mode} match${newMatches.length === 1 ? "" : "es"} drafted.`);
  };

  App.renderMatches = function renderMatches() {
    const list = App.$("#matches-list");
    const matches = [...App.state.matches];
    App.$("#match-count").textContent = `${matches.length} MATCH${matches.length === 1 ? "" : "ES"}`;
    if (!matches.length) {
      list.innerHTML = '<div class="empty-state"><span class="empty-symbol">↗</span><strong>No matches drafted yet</strong><span>Add your players above, then draft a schedule.</span></div>';
      return;
    }
    list.replaceChildren(...matches.map((match, index) => {
      const names = App.namesForMatch(match);
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
        const durationTag = match.durationSeconds ? `  ·  ${App.formatTime(match.durationSeconds * 1000)}` : "";
        result.textContent = `FINAL  ${match.scoreA} — ${match.scoreB}  ·  ${match.winner === "A" ? names.left : names.right} WON${durationTag}`;
        card.append(result);
      } else {
        card.dataset.order = String(index + 1);
      }
      return card;
    }));
  };

  App.loadMatch = function loadMatch(matchId) {
    const match = App.state.matches.find((item) => item.id === matchId);
    if (!match) return;
    const names = App.namesForMatch(match);
    App.state.game = {
      ...App.initialState.game,
      left: match.completed ? match.scoreA : 0,
      right: match.completed ? match.scoreB : 0,
      mode: match.mode,
      matchId: match.id,
      leftLabel: names.left,
      rightLabel: names.right,
      winner: match.completed ? match.winner : null,
      startedAt: match.completed ? null : Date.now(),
    };
    App.scoreHistory = [];
    App.saveState();
    App.renderGame();
    App.switchView("score-view");
    if (match.completed) App.showToast("Viewing finalized match score.");
  };

  App.finalizeMatch = function finalizeMatch() {
    const game = App.state.game;
    const match = App.state.matches.find((item) => item.id === game.matchId);
    const side = App.winnerSide();
    if (!match || !side || match.completed) return;
    match.scoreA = game.left;
    match.scoreB = game.right;
    match.winner = side === "left" ? "A" : "B";
    match.completed = true;
    match.completedAt = new Date().toISOString();
    match.startedAt = game.startedAt || null;
    match.endedAt = Date.now();
    match.durationSeconds = Math.round(App.gameElapsedMs() / 1000) || null;
    App.saveState();
    App.$("#result-dialog").close();
    App.renderMatches();
    App.renderStandings();
    App.renderGame();
    App.showToast("Match finalized. Standings are up to date.");
  };

  App.openResultDialog = function openResultDialog() {
    const side = App.winnerSide();
    if (!side) return;
    const score = `${App.state.game.left} — ${App.state.game.right}`;
    const elapsed = App.gameElapsedMs();
    App.$("#result-title").textContent = `${App.teamDisplayName(side)} wins!`;
    App.$("#result-summary").textContent = elapsed ? `${score} · ${App.formatTime(elapsed)}` : `${score}`;
    const match = App.state.matches.find((item) => item.id === App.state.game.matchId);
    App.$("#dialog-finalize").hidden = !match || match.completed;
    App.$("#dialog-next").hidden = !match || match.completed || !App.nextUncompletedMatch(App.state.game.matchId);
    const dialog = App.$("#result-dialog");
    if (!dialog.open) {
      dialog.showModal();
    }
  };

  App.nextUncompletedMatch = function nextUncompletedMatch(excludeId) {
    return App.state.matches.find((match) => !match.completed && match.id !== excludeId) || null;
  };

  App.buildMatchup = function buildMatchup(container, names, mode) {
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
  };

  App.openNextMatch = function openNextMatch() {
    const match = App.nextUncompletedMatch(App.state.game.matchId);
    if (!match) {
      App.showToast("No more matches in the schedule.");
      return;
    }
    App.buildMatchup(App.$("#next-matchup"), App.namesForMatch(match), match.mode);
    App.$("#next-mode").textContent = match.mode === "doubles" ? "Doubles · 2 vs 2" : "Singles · 1 vs 1";
    App.nextMatchId = match.id;
    const dialog = App.$("#next-match-dialog");
    if (!dialog.open) dialog.showModal();
  };

  App.openViewMatchModal = function openViewMatchModal(matchId) {
    const match = App.state.matches.find((item) => item.id === matchId);
    if (!match) return;
    const names = App.namesForMatch(match);
    App.buildMatchup(App.$("#view-matchup"), names, match.mode);
    App.$("#view-score").textContent = `${match.scoreA} — ${match.scoreB}`;
    const winner = match.winner === "A" ? names.left : names.right;
    const modeText = match.mode === "doubles" ? "Doubles" : "Singles";
    const durationText = match.durationSeconds ? ` · ${App.formatTime(match.durationSeconds * 1000)}` : "";
    App.$("#view-details").textContent = `${winner} won · ${modeText}${durationText}`;
    App.$("#view-times").textContent = `Started ${App.formatDateTime(match.startedAt)} · Ended ${App.formatDateTime(match.endedAt)}`;
    const dialog = App.$("#view-match-dialog");
    if (!dialog.open) dialog.showModal();
  };
})();
