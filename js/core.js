(() => {
  const App = (window.App = window.App || {});

  App.STORAGE_KEY = "rally-pickleball-v1";
  App.initialState = {
    players: [],
    matches: [],
    sessions: [],
    game: { left: 0, right: 0, serving: "left", server: 1, mode: "doubles", matchId: null, leftLabel: "HOME", rightLabel: "AWAY", winner: null, startedAt: null, durationMs: 0 },
  };

  App.$ = (selector, root = document) => root.querySelector(selector);
  App.$$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  App.loadState = function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(App.STORAGE_KEY));
      if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.matches)) return structuredClone(App.initialState);
      const game = { ...App.initialState.game, ...(saved.game || {}) };
      if (!App.isWinningScore(game)) {
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
      return structuredClone(App.initialState);
    }
  };

  App.saveState = function saveState() {
    try {
      localStorage.setItem(App.STORAGE_KEY, JSON.stringify(App.state));
    } catch {
      App.showToast("Could not save on this device. Check browser storage settings.");
    }
  };

  App.id = function id() {
    return globalThis.crypto?.randomUUID?.() || `rally-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  App.playerName = function playerName(playerId) {
    return App.state.players.find((player) => player.id === playerId)?.name || "Player removed";
  };

  App.namesForMatch = function namesForMatch(match) {
    return {
      left: match.teamA.map(App.playerName).join(" / "),
      right: match.teamB.map(App.playerName).join(" / "),
    };
  };

  App.showToast = function showToast(message) {
    const toast = App.$("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(App.toastTimer);
    App.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  };

  App.formatTime = function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  App.formatDateTime = function formatDateTime(timestamp) {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };

  App.localDateISO = function localDateISO(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  App.dateLabel = function dateLabel(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  };
})();
