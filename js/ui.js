(() => {
  const App = (window.App = window.App || {});

  App.switchView = function switchView(viewId) {
    App.$$(".view").forEach((view) => { view.hidden = view.id !== viewId; });
    App.$$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
    const shownView = document.getElementById(viewId);
    if (shownView) {
      shownView.classList.remove("view-anim");
      void shownView.offsetWidth;
      shownView.classList.add("view-anim");
    }
    if (viewId === "session-view") {
      App.renderPlayers();
      App.renderMatches();
      App.renderStandings();
    }
    if (viewId === "sessions-view") {
      App.renderSessions();
    }
    if (viewId === "alltime-view") {
      App.renderAllTime();
    }
  };

  App.applyTheme = function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const button = App.$("#theme-button");
    if (!button) return;
    const dark = theme === "dark";
    button.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  };

  App.isFullscreenActive = function isFullscreenActive() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  };

  App.enterFullscreen = function enterFullscreen() {
    document.body.classList.add("fullscreen-mode");
    const exitButton = App.$("#exit-fullscreen");
    if (exitButton) exitButton.hidden = false;
    const element = document.documentElement;
    const request = element.requestFullscreen || element.webkitRequestFullscreen;
    if (!request) return;
    try {
      const result = request.call(element);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch { /* fall back to the CSS landscape view */ }
  };

  App.exitFullscreen = function exitFullscreen() {
    document.body.classList.remove("fullscreen-mode");
    const exitButton = App.$("#exit-fullscreen");
    if (exitButton) exitButton.hidden = true;
    if (!App.isFullscreenActive()) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return;
    try {
      const result = exit.call(document);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch { /* ignore */ }
  };

  App.toggleFullscreen = function toggleFullscreen() {
    if (document.body.classList.contains("fullscreen-mode")) App.exitFullscreen();
    else App.enterFullscreen();
  };
})();
