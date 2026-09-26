(() => {
  const App = (window.App = window.App || {});

  App.gameElapsedMs = function gameElapsedMs(game = App.state.game) {
    if (game.durationMs) return game.durationMs;
    if (game.startedAt) return Date.now() - game.startedAt;
    return 0;
  };

  App.stopGameTimer = function stopGameTimer() {
    clearInterval(App.timerInterval);
    App.timerInterval = null;
  };

  App.syncGameTimer = function syncGameTimer() {
    const timerNode = App.$("#game-timer");
    if (timerNode) timerNode.textContent = App.formatTime(App.gameElapsedMs());
    App.stopGameTimer();
    if (App.state.game.startedAt && !App.winnerSide()) {
      App.timerInterval = setInterval(() => {
        const node = App.$("#game-timer");
        if (node) node.textContent = App.formatTime(App.gameElapsedMs());
      }, 1000);
    }
  };
})();
