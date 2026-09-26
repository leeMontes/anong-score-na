(() => {
  const App = (window.App = window.App || {});

  App.isWinningScore = function isWinningScore(game) {
    return game.left >= 11 || game.right >= 11;
  };

  App.winnerSide = function winnerSide(game = App.state.game) {
    if (!App.isWinningScore(game)) return null;
    return game.left > game.right ? "left" : "right";
  };

  App.teamDisplayName = function teamDisplayName(side) {
    const game = App.state.game;
    if (side === "left") return game.leftLabel || "HOME";
    return game.rightLabel || "AWAY";
  };

  App.renderDigit = function renderDigit(scoreNode, value, animate = false) {
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
  };

  App.renderGame = function renderGame(animate = false) {
    const game = App.state.game;
    const leftScoreNode = App.$("#left-score");
    const rightScoreNode = App.$("#right-score");
    App.renderDigit(leftScoreNode, game.left, animate);
    App.renderDigit(rightScoreNode, game.right, animate);
    leftScoreNode.setAttribute("aria-label", `Left side score: ${game.left}. Tap to add a point; two-finger tap to subtract.`);
    rightScoreNode.setAttribute("aria-label", `Right side score: ${game.right}. Tap to add a point; two-finger tap to subtract.`);
    App.$("#left-team-name").textContent = game.leftLabel || "HOME";
    App.$("#right-team-name").textContent = game.rightLabel || "AWAY";
    App.$("#service-number").textContent = game.mode === "singles" ? "—" : String(game.server);
    App.$("#service-number").disabled = game.mode === "singles";
    App.$("#service-number").setAttribute("aria-label", game.mode === "singles" ? "Server switching is available in doubles." : `Server ${game.server}. Tap to switch server.`);
    App.$("#service-caption").textContent = game.mode === "singles" ? "SINGLES" : "OF 2";
    App.$("#score-call").textContent = game.mode === "singles"
      ? `${game.left} — ${game.right}`
      : `${game.left} — ${game.right} — ${game.server}`;
    App.$("#left-serve-badge").hidden = game.serving !== "left";
    App.$("#right-serve-badge").hidden = game.serving !== "right";
    App.$(".left-team").classList.toggle("serving", game.serving === "left");
    App.$(".right-team").classList.toggle("serving", game.serving === "right");
    App.$$("[data-serving]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.serving === game.serving)));
    App.$$(".format-button").forEach((button) => {
      const active = button.dataset.mode === game.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    App.$("#server-toggle").hidden = game.mode === "singles";
    App.$("#server-toggle").setAttribute("aria-label", `Switch to server ${game.server === 1 ? 2 : 1}`);
    App.$$("#server-toggle strong").forEach((item) => item.classList.toggle("selected", Number(item.textContent) === game.server));
    App.$("#status-text").textContent = App.winnerSide() ? "GAME COMPLETE" : "GAME IN PROGRESS";
    App.$("#undo-button").disabled = App.scoreHistory.length === 0;
    const selectedMatch = App.state.matches.find((match) => match.id === game.matchId);
    const finalize = App.$("#finalize-button");
    finalize.hidden = !selectedMatch || selectedMatch.completed || !App.winnerSide();
    App.syncGameTimer();
  };

  App.startTesterGame = function startTesterGame() {
    if (App.isViewer) return;
    if (App.state.game.matchId || App.state.game.left > 0 || App.state.game.right > 0) {
      const proceed = window.confirm("Start a fresh score card? This clears the current score and detaches from any match.");
      if (!proceed) return;
    }
    App.resetGame({ keepMatch: false });
    App.showToast("Score card tester ready — not tied to a match.");
  };

  App.resetGame = function resetGame({ keepMatch = false, startTimer = true } = {}) {
    if (App.isViewer) return;
    const previous = App.state.game;
    App.state.game = {
      ...App.initialState.game,
      mode: previous.mode,
      matchId: keepMatch ? previous.matchId : null,
      leftLabel: keepMatch ? previous.leftLabel : "HOME",
      rightLabel: keepMatch ? previous.rightLabel : "AWAY",
      startedAt: startTimer ? Date.now() : null,
    };
    App.scoreHistory = [];
    App.saveState();
    App.renderGame();
  };

  App.updateScore = function updateScore(side, change) {
    if (App.isViewer) return;
    const game = App.state.game;
    if (App.winnerSide()) {
      App.showToast("This game is complete. Finalize the result or reset the score.");
      return;
    }
    if (change < 0 && game[side] === 0) return;
    App.scoreHistory.push({ ...game });
    game[side] = Math.max(0, Math.min(99, game[side] + change));
    if (App.winnerSide() && !game.durationMs) game.durationMs = Date.now() - (game.startedAt || Date.now());
    App.renderGame(true);
    if (App.winnerSide()) App.openResultDialog();
    App.saveState();
  };

  App.revertScore = function revertScore(side) {
    if (App.isViewer) return;
    const game = App.state.game;
    if (game[side] === 0) return;
    App.scoreHistory.push({ ...game });
    game[side] = Math.max(0, game[side] - 1);
    if (!App.winnerSide()) game.durationMs = 0;
    App.renderGame(true);
    App.saveState();
  };

  App.undoPoint = function undoPoint() {
    if (App.isViewer) return false;
    const previous = App.scoreHistory.pop();
    if (!previous) return false;
    App.state.game = previous;
    App.saveState();
    App.renderGame(true);
    return true;
  };

  App.toggleServer = function toggleServer() {
    if (App.isViewer) return;
    if (App.state.game.mode === "singles") return;
    App.state.game.server = App.state.game.server === 1 ? 2 : 1;
    App.saveState();
    App.renderGame();
  };
})();
