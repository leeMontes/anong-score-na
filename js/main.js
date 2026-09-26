(() => {
  const App = (window.App = window.App || {});

  const liveRoom = new URLSearchParams(window.location.search).get("live");
  if (liveRoom) App.isViewer = true;

  App.state = App.isViewer ? structuredClone(App.initialState) : App.loadState();
  App.scoreHistory = [];

  const scoreTouches = { left: new Set(), right: new Set() };
  const scoreMulti = { left: false, right: false };
  const clickSuppressUntil = { left: 0, right: 0 };

  function bindEvents() {
    App.$(".main-nav").addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (button) App.switchView(button.dataset.view);
    });

    App.$$(".format-button").forEach((button) => button.addEventListener("click", () => {
      if (App.isViewer) return;
      if (App.state.game.matchId) {
        const match = App.state.matches.find((item) => item.id === App.state.game.matchId);
        if (match && !match.completed) {
          App.showToast("Match format is set by the drafted match.");
          return;
        }
      }
      App.state.game.mode = button.dataset.mode;
      App.saveState();
      App.renderGame();
    }));

    App.$$("[data-score-tap]").forEach((button) => {
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
            App.revertScore(side);
          } else {
            App.updateScore(side, 1);
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
        App.updateScore(side, 1);
      });
    });

    App.$$("[data-score]").forEach((button) => button.addEventListener("click", () => {
      App.updateScore(button.dataset.score, Number(button.dataset.change));
    }));

    App.$$("[data-serving]").forEach((button) => button.addEventListener("click", () => {
      App.state.game.serving = button.dataset.serving;
      if (App.state.game.mode === "doubles") App.state.game.server = 1;
      App.saveState();
      App.renderGame();
    }));

    App.$("#server-toggle").addEventListener("click", App.toggleServer);
    App.$("#service-number").addEventListener("click", App.toggleServer);
    App.$("#undo-button").addEventListener("click", () => {
      App.undoPoint();
    });
    App.$("#reset-button").addEventListener("click", () => {
      if (App.state.game.left || App.state.game.right) {
        const confirmed = window.confirm("Reset both scores to zero?");
        if (!confirmed) return;
      }
      App.resetGame({ keepMatch: true });
    });
    App.$("#tester-button").addEventListener("click", App.startTesterGame);
    App.$("#finalize-button").addEventListener("click", App.openResultDialog);
    App.$("#dialog-finalize").addEventListener("click", App.finalizeMatch);
    App.$("#dialog-next").addEventListener("click", () => {
      App.finalizeMatch();
      App.openNextMatch();
    });
    App.$("#close-result").addEventListener("click", () => App.$("#result-dialog").close());
    App.$("#result-dialog").addEventListener("click", (event) => {
      if (event.target === App.$("#result-dialog")) App.$("#result-dialog").close();
    });
    App.$("#next-cancel").addEventListener("click", () => App.$("#next-match-dialog").close());
    App.$("#next-start").addEventListener("click", () => {
      const match = App.state.matches.find((item) => item.id === App.nextMatchId);
      App.$("#next-match-dialog").close();
      if (match) App.loadMatch(match.id);
    });
    App.$("#next-match-dialog").addEventListener("click", (event) => {
      if (event.target === App.$("#next-match-dialog")) App.$("#next-match-dialog").close();
    });

    App.$("#player-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (App.isViewer) return;
      const input = App.$("#player-name");
      const name = input.value.trim();
      if (!name) return;
      if (App.state.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        App.showToast("That player is already on the roster.");
        input.select();
        return;
      }
      App.state.players.push({ id: App.id(), name });
      input.value = "";
      App.saveState();
      App.renderPlayers();
      App.renderStandings();
      input.focus();
    });

    App.$("#player-list").addEventListener("click", (event) => {
      if (App.isViewer) return;
      const button = event.target.closest("[data-remove-player]");
      if (!button) return;
      const player = App.state.players.find((item) => item.id === button.dataset.removePlayer);
      if (!player) return;
      App.state.players = App.state.players.filter((item) => item.id !== player.id);
      App.state.matches = App.state.matches.filter((match) => match.completed || (!match.teamA.includes(player.id) && !match.teamB.includes(player.id)));
      App.saveState();
      App.renderPlayers();
      App.renderMatches();
      App.renderStandings();
      if (App.state.game.matchId && App.state.matches.some((match) => match.id === App.state.game.matchId)) App.loadMatch(App.state.game.matchId);
    });

    App.$("#draft-button").addEventListener("click", App.draftMatches);
    App.$("#wrapup-button").addEventListener("click", App.openWrapUpConfirm);
    App.$("#clear-schedule").addEventListener("click", App.openClearConfirm);
    App.$("#go-live").addEventListener("click", App.startLiveShare);
    App.$("#live-stop").addEventListener("click", App.stopLiveShare);
    App.$("#live-copy").addEventListener("click", async () => {
      const link = App.$("#qr-link");
      try {
        await navigator.clipboard.writeText(link.value);
        App.showToast("Live link copied.");
      } catch {
        link.select();
        App.showToast("Press copy to grab the link.");
      }
    });
    App.$("#live-dialog").addEventListener("click", (event) => {
      if (event.target === App.$("#live-dialog")) App.$("#live-dialog").close();
    });
    App.$("#matches-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-match-id]");
      if (!button) return;
      if (button.dataset.completed === "1") App.openViewMatchModal(button.dataset.matchId);
      else if (!App.isViewer) App.loadMatch(button.dataset.matchId);
    });
    App.$("#view-close").addEventListener("click", () => App.$("#view-match-dialog").close());
    App.$("#view-match-dialog").addEventListener("click", (event) => {
      if (event.target === App.$("#view-match-dialog")) App.$("#view-match-dialog").close();
    });

    App.$("#standings-list").addEventListener("click", (event) => {
      const row = event.target.closest("[data-player-id]");
      if (row) App.openPlayerModal(row.dataset.playerId);
    });
    App.$("#standings-list").addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-player-id]");
      if (!row) return;
      event.preventDefault();
      App.openPlayerModal(row.dataset.playerId);
    });
    App.$("#player-modal-close").addEventListener("click", App.closePlayerModal);
    App.$("#player-modal").addEventListener("click", (event) => {
      if (event.target.closest("[data-close-player-modal]")) App.closePlayerModal();
    });

    App.$("#sessions-list").addEventListener("click", (event) => {
      const card = event.target.closest("[data-session-id]");
      if (card) App.openSessionModal(card.dataset.sessionId);
    });
    App.$("#session-modal-close").addEventListener("click", App.closeSessionModal);
    App.$("#session-modal").addEventListener("click", (event) => {
      if (event.target.closest("[data-close-session-modal]")) App.closeSessionModal();
    });
    App.$("#session-screenshot").addEventListener("click", () => {
      App.saveSessionScreenshot(App.$("#session-modal").dataset.sessionId);
    });
    App.$("#session-delete").addEventListener("click", () => {
      const dialog = App.$("#confirm-delete-dialog");
      if (!dialog.open) dialog.showModal();
    });
    App.$("#confirm-delete-cancel").addEventListener("click", () => App.$("#confirm-delete-dialog").close());
    App.$("#confirm-delete-ok").addEventListener("click", () => {
      const sessionId = App.$("#session-modal").dataset.sessionId;
      App.$("#confirm-delete-dialog").close();
      App.closeSessionModal();
      if (sessionId) {
        App.deleteSession(sessionId);
        App.showToast("Session deleted.");
      }
    });
    App.$("#confirm-delete-dialog").addEventListener("click", (event) => {
      if (event.target === App.$("#confirm-delete-dialog")) App.$("#confirm-delete-dialog").close();
    });
    App.$("#confirm-wrapup-cancel").addEventListener("click", () => App.$("#confirm-wrapup-dialog").close());
    App.$("#confirm-wrapup-ok").addEventListener("click", () => {
      App.$("#confirm-wrapup-dialog").close();
      App.wrapUpSession();
    });
    App.$("#confirm-wrapup-dialog").addEventListener("click", (event) => {
      if (event.target === App.$("#confirm-wrapup-dialog")) App.$("#confirm-wrapup-dialog").close();
    });
    App.$("#confirm-clear-cancel").addEventListener("click", () => App.$("#confirm-clear-dialog").close());
    App.$("#confirm-clear-ok").addEventListener("click", () => {
      App.$("#confirm-clear-dialog").close();
      App.clearSchedule();
    });
    App.$("#confirm-clear-dialog").addEventListener("click", (event) => {
      if (event.target === App.$("#confirm-clear-dialog")) App.$("#confirm-clear-dialog").close();
    });

    App.$("#alltime-standings").addEventListener("click", (event) => {
      const row = event.target.closest("[data-player-id]");
      if (row) App.openPlayerModal(row.dataset.playerId, App.buildAllTimeContext());
    });
    App.$("#alltime-standings").addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-player-id]");
      if (!row) return;
      event.preventDefault();
      App.openPlayerModal(row.dataset.playerId, App.buildAllTimeContext());
    });

    App.$("#session-modal-standings").addEventListener("click", (event) => {
      const row = event.target.closest("[data-player-id]");
      if (row) App.openSessionPlayer(row.dataset.playerId);
    });
    App.$("#session-modal-standings").addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-player-id]");
      if (!row) return;
      event.preventDefault();
      App.openSessionPlayer(row.dataset.playerId);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const nativeDialogOpen = ["confirm-delete-dialog", "confirm-wrapup-dialog", "confirm-clear-dialog", "view-match-dialog", "result-dialog", "next-match-dialog", "live-dialog"]
        .some((dialogId) => document.getElementById(dialogId)?.open);
      if (nativeDialogOpen) return;
      if (!App.$("#player-modal").hidden) App.closePlayerModal();
      else App.closeSessionModal();
    });

    App.$(".orientation-button").addEventListener("click", () => {
      const rotated = document.body.classList.toggle("manual-landscape");
      App.$(".orientation-button").setAttribute("aria-label", rotated ? "Return to portrait orientation" : "Rotate screen");
      App.$(".orientation-button").title = rotated ? "Return to portrait" : "Rotate screen";
    });
  }

  function bindFullscreen() {
    const fullscreenButton = App.$("#fullscreen-button");
    const exitFullscreenButton = App.$("#exit-fullscreen");
    fullscreenButton.addEventListener("click", App.toggleFullscreen);
    exitFullscreenButton.addEventListener("click", App.exitFullscreen);
    ["fullscreenchange", "webkitfullscreenchange"].forEach((eventName) => {
      document.addEventListener(eventName, () => {
        if (!App.isFullscreenActive() && document.body.classList.contains("fullscreen-mode")) {
          document.body.classList.remove("fullscreen-mode");
          exitFullscreenButton.hidden = true;
        }
      });
    });
  }

  function bindTheme() {
    App.theme = "light";
    try { App.theme = localStorage.getItem("anong-theme") || "light"; } catch { App.theme = "light"; }
    App.applyTheme(App.theme);
    App.$("#theme-button").addEventListener("click", () => {
      App.theme = App.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("anong-theme", App.theme); } catch { /* ignore */ }
      App.applyTheme(App.theme);
    });
  }

  function spinBrandMark() {
    const brandMark = App.$(".brand-mark");
    if (!brandMark) return;
    brandMark.classList.add("spin");
    brandMark.addEventListener("animationend", function handleBrandSpin(event) {
      if (event.animationName !== "brand-spin") return;
      brandMark.classList.remove("spin");
      brandMark.removeEventListener("animationend", handleBrandSpin);
    });
  }

  bindEvents();
  bindFullscreen();
  bindTheme();

  App.renderAll();

  if (liveRoom) App.initLiveViewer(liveRoom);

  spinBrandMark();
})();
