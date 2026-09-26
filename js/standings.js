(() => {
  const App = (window.App = window.App || {});

  App.computeStandings = function computeStandings(players, matches) {
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
  };

  App.buildStandingsList = function buildStandingsList(container, standings, onSelect, options = {}) {
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
  };

  App.renderStandings = function renderStandings() {
    const list = App.$("#standings-list");
    const standings = App.computeStandings(App.state.players, App.state.matches).filter((entry) => entry.played > 0);
    const hasStandings = standings.length > 0;
    const note = App.$("#standings-note");
    const head = App.$("#live-head");
    const foot = App.$("#live-foot");
    if (note) note.hidden = !hasStandings;
    if (head) head.hidden = !hasStandings;
    if (foot) foot.hidden = !hasStandings;
    if (!hasStandings) {
      list.innerHTML = '<div class="standings-empty">No results yet — finalize a match to see standings.</div>';
      return;
    }
    App.buildStandingsList(list, standings, true);
  };

  App.buildAllTimeContext = function buildAllTimeContext() {
    const playersById = new Map();
    App.state.players.forEach((player) => playersById.set(player.id, { ...player }));
    const matches = [...App.state.matches.filter((match) => match.completed)];
    App.state.sessions.forEach((session) => {
      session.players.forEach((player) => {
        if (!playersById.has(player.id)) playersById.set(player.id, { ...player });
      });
      session.matches.forEach((match) => {
        matches.push(match);
      });
    });
    return { players: [...playersById.values()], matches };
  };

  App.renderAllTime = function renderAllTime() {
    const list = App.$("#alltime-standings");
    const context = App.buildAllTimeContext();
    const standings = App.computeStandings(context.players, context.matches).filter((entry) => entry.played > 0);
    const hasStandings = standings.length > 0;
    const head = App.$("#alltime-head");
    const foot = App.$("#alltime-foot");
    if (head) head.hidden = !hasStandings;
    if (foot) foot.hidden = !hasStandings;
    if (!hasStandings) {
      list.innerHTML = '<div class="standings-empty">No results yet. Play and finalize matches (or wrap up a day) to build your all-time record.</div>';
      return;
    }
    App.buildStandingsList(list, standings, true, { showGames: true });
  };

  App.getPlayerHistory = function getPlayerHistory(players, matches, playerId) {
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
  };

  App.openPlayerModal = function openPlayerModal(playerId, context) {
    const players = context?.players || App.state.players;
    const matches = context?.matches || App.state.matches;
    const nameOf = (id) => players.find((player) => player.id === id)?.name || "Player";
    const player = players.find((item) => item.id === playerId);
    if (!player) return;
    const history = App.getPlayerHistory(players, matches, playerId);
    const totals = history.reduce((acc, entry) => ({ wins: acc.wins + entry.wins, losses: acc.losses + entry.losses }), { wins: 0, losses: 0 });
    const played = totals.wins + totals.losses;
    const rate = played ? Math.round((totals.wins / played) * 100) : 0;
    const playerMatches = matches.filter((match) => match.completed && (match.teamA.includes(playerId) || match.teamB.includes(playerId)));
    const durations = playerMatches.map((match) => match.durationSeconds).filter((value) => typeof value === "number" && value > 0);
    const avgSeconds = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
    App.$("#player-modal-name").textContent = player.name;
    App.$("#player-modal-record").textContent = played
      ? `${totals.wins}W — ${totals.losses}L · ${rate}% win rate · ${played} game${played === 1 ? "" : "s"}${avgSeconds ? ` · avg ${App.formatTime(avgSeconds * 1000)}` : ""}`
      : "No finalized matches yet";
    const body = App.$("#player-modal-body");
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
    const modal = App.$("#player-modal");
    clearTimeout(App.playerModalTimer);
    modal.hidden = false;
    modal.dataset.playerId = playerId;
    void modal.offsetWidth;
    modal.classList.add("open");
  };

  App.closePlayerModal = function closePlayerModal() {
    const modal = App.$("#player-modal");
    if (modal.hidden) return;
    modal.classList.remove("open");
    clearTimeout(App.playerModalTimer);
    App.playerModalTimer = setTimeout(() => { modal.hidden = true; }, 260);
  };
})();
