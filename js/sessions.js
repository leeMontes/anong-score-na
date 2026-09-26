(() => {
  const App = (window.App = window.App || {});

  App.namesForMatchIn = function namesForMatchIn(players, match) {
    const nameOf = (playerId) => players.find((player) => player.id === playerId)?.name || "Player";
    return {
      left: match.teamA.map(nameOf).join(" / "),
      right: match.teamB.map(nameOf).join(" / "),
    };
  };

  App.renderSessions = function renderSessions() {
    const list = App.$("#sessions-list");
    const sessions = [...App.state.sessions].sort((a, b) => b.wrappedAt - a.wrappedAt);
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
      heading.textContent = App.dateLabel(dateISO);
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
  };

  App.openSessionModal = function openSessionModal(sessionId) {
    const session = App.state.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const time = new Date(session.wrappedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    App.$("#session-modal-title").textContent = App.dateLabel(session.dateISO);
    App.$("#session-modal-record").textContent = `${session.matches.length} match${session.matches.length === 1 ? "" : "es"} · wrapped at ${time}`;
    const matchesHost = App.$("#session-modal-matches");
    matchesHost.replaceChildren(...session.matches.map((match) => {
      const names = App.namesForMatchIn(session.players, match);
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
      const durationText = match.durationSeconds ? ` · ${App.formatTime(match.durationSeconds * 1000)}` : "";
      winner.textContent = `${winnerName} won · ${match.mode === "doubles" ? "Doubles" : "Singles"}${durationText}`;
      row.append(left, score, right, winner);
      return row;
    }));
    App.buildStandingsList(App.$("#session-modal-standings"), App.computeStandings(session.players, session.matches), true);
    const modal = App.$("#session-modal");
    clearTimeout(App.sessionModalTimer);
    modal.hidden = false;
    modal.dataset.sessionId = sessionId;
    void modal.offsetWidth;
    modal.classList.add("open");
  };

  App.closeSessionModal = function closeSessionModal() {
    const modal = App.$("#session-modal");
    if (modal.hidden) return;
    modal.classList.remove("open");
    clearTimeout(App.sessionModalTimer);
    App.sessionModalTimer = setTimeout(() => { modal.hidden = true; }, 260);
  };

  App.deleteSession = function deleteSession(sessionId) {
    if (App.isViewer) return;
    const index = App.state.sessions.findIndex((item) => item.id === sessionId);
    if (index === -1) return;
    App.state.sessions.splice(index, 1);
    App.saveState();
    App.renderSessions();
  };

  App.openSessionPlayer = function openSessionPlayer(playerId) {
    const session = App.state.sessions.find((item) => item.id === App.$("#session-modal").dataset.sessionId);
    if (session) App.openPlayerModal(playerId, { players: session.players, matches: session.matches });
  };

  App.openWrapUpConfirm = function openWrapUpConfirm() {
    const completed = App.state.matches.filter((match) => match.completed);
    const incomplete = App.state.matches.filter((match) => !match.completed);
    if (!completed.length) {
      App.showToast("Nothing to wrap up yet — no finalized matches.");
      return;
    }
    const matchWord = completed.length === 1 ? "match" : "matches";
    let message = `Wrap up ${completed.length} finalized ${matchWord}?`;
    if (incomplete.length) {
      message += ` ${incomplete.length} unplayed match${incomplete.length === 1 ? "" : "es"} will stay on the schedule.`;
    }
    App.$("#confirm-wrapup-text").textContent = message;
    const dialog = App.$("#confirm-wrapup-dialog");
    if (!dialog.open) dialog.showModal();
  };

  App.wrapUpSession = function wrapUpSession() {
    if (App.isViewer) return;
    const completed = App.state.matches.filter((match) => match.completed);
    const incomplete = App.state.matches.filter((match) => !match.completed);
    if (!completed.length) return;
    const now = new Date();
    const session = {
      id: App.id(),
      dateISO: App.localDateISO(now),
      wrappedAt: now.getTime(),
      players: App.state.players.map((player) => ({ ...player })),
      matches: completed.map((match) => ({ ...match, teamA: [...match.teamA], teamB: [...match.teamB] })),
    };
    App.state.sessions.push(session);
    App.state.matches = incomplete;
    if (App.state.game.matchId && !incomplete.some((match) => match.id === App.state.game.matchId)) {
      App.resetGame({ keepMatch: false, startTimer: false });
    }
    App.saveState();
    App.renderMatches();
    App.renderStandings();
    App.renderSessions();
    App.showToast(`Wrapped up ${completed.length} match${completed.length === 1 ? "" : "es"}.`);
    App.openSessionModal(session.id);
  };

  App.openClearConfirm = function openClearConfirm() {
    const total = App.state.matches.length;
    if (!total) {
      App.showToast("Nothing to clear — the schedule is already empty.");
      return;
    }
    App.$("#confirm-clear-text").textContent = `This removes all ${total} match${total === 1 ? "" : "es"}, including finalized results. You can draft a new schedule afterward.`;
    const dialog = App.$("#confirm-clear-dialog");
    if (!dialog.open) dialog.showModal();
  };

  App.clearSchedule = function clearSchedule() {
    if (App.isViewer) return;
    App.state.matches = [];
    if (App.state.game.matchId) {
      App.resetGame({ keepMatch: false, startTimer: false });
    }
    App.saveState();
    App.renderMatches();
    App.renderStandings();
    App.showToast("Schedule cleared.");
  };
})();
