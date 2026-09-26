(() => {
  const App = (window.App = window.App || {});

  App.isViewer = false;

  let hostPeer = null;
  let hostConnections = [];

  const ROOM_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

  function makeRoomId(length = 6) {
    const bytes = new Uint8Array(length);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += ROOM_CHARS[(bytes[index] || Math.floor(Math.random() * 256)) % ROOM_CHARS.length];
    }
    return out;
  }

  function viewerUrl(roomId) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("live", roomId);
    return url.toString();
  }

  function setBadge(text, state) {
    const badge = App.$("#live-badge");
    if (!badge) return;
    badge.hidden = false;
    badge.dataset.state = state || "";
    const node = App.$("#live-badge-text");
    if (node) node.textContent = text;
  }

  function updateHostUi() {
    const count = hostConnections.length;
    const button = App.$("#go-live");
    if (button) button.textContent = count ? `Live · ${count} watching` : "You're live";
    const status = App.$("#live-status");
    if (status) status.textContent = count
      ? `${count} device${count === 1 ? "" : "s"} watching`
      : "Waiting for viewers to scan…";
  }

  function broadcast() {
    if (!hostConnections.length) return;
    const payload = { type: "state", state: App.state };
    hostConnections.forEach((conn) => {
      if (conn.open) {
        try { conn.send(payload); } catch { /* ignore */ }
      }
    });
  }
  App.broadcastLive = broadcast;

  function handleConnection(conn) {
    hostConnections.push(conn);
    conn.on("open", () => {
      updateHostUi();
      try { conn.send({ type: "state", state: App.state }); } catch { /* ignore */ }
    });
    const drop = () => {
      hostConnections = hostConnections.filter((item) => item !== conn);
      updateHostUi();
    };
    conn.on("close", drop);
    conn.on("error", drop);
  }

  function renderQr(url) {
    const host = App.$("#qr-code");
    if (!host) return;
    host.replaceChildren();
    if (window.QRCode) {
      new window.QRCode(host, { text: url, width: 216, height: 216, correctLevel: window.QRCode.CorrectLevel.M });
    } else {
      host.textContent = url;
    }
    const link = App.$("#qr-link");
    if (link) link.value = url;
  }

  function startHosting(attempt) {
    const roomId = makeRoomId();
    const peer = new window.Peer(roomId, { debug: 1 });
    peer.on("open", () => {
      hostPeer = peer;
      renderQr(viewerUrl(roomId));
      const dialog = App.$("#live-dialog");
      if (dialog && !dialog.open) dialog.showModal();
      updateHostUi();
      App.showToast("You're live — scan the QR to watch.");
    });
    peer.on("connection", handleConnection);
    peer.on("error", (error) => {
      const type = error && error.type;
      if (type === "unavailable-id" && attempt < 5) {
        try { peer.destroy(); } catch { /* ignore */ }
        startHosting(attempt + 1);
        return;
      }
      if (!hostPeer) App.showToast("Could not go live. Check your connection and try again.");
    });
  }

  App.startLiveShare = function startLiveShare() {
    if (hostPeer) {
      const dialog = App.$("#live-dialog");
      if (dialog && !dialog.open) dialog.showModal();
      return;
    }
    startHosting(0);
  };

  App.stopLiveShare = function stopLiveShare() {
    hostConnections.forEach((conn) => { try { conn.close(); } catch { /* ignore */ } });
    hostConnections = [];
    if (hostPeer) {
      try { hostPeer.destroy(); } catch { /* ignore */ }
    }
    hostPeer = null;
    const dialog = App.$("#live-dialog");
    if (dialog && dialog.open) dialog.close();
    const button = App.$("#go-live");
    if (button) button.textContent = "Go live";
    const badge = App.$("#live-badge");
    if (badge) badge.hidden = true;
    App.showToast("Stopped sharing.");
  };

  App.initLiveViewer = function initLiveViewer(roomId) {
    App.isViewer = true;
    document.body.classList.add("viewer");
    setBadge("Connecting…", "connecting");
    const peer = new window.Peer({ debug: 1 });
    peer.on("open", () => {
      const conn = peer.connect(roomId, { reliable: true });
      conn.on("open", () => setBadge("Live", "live"));
      conn.on("data", (payload) => {
        if (!payload || payload.type !== "state" || !payload.state) return;
        App.state = payload.state;
        App.renderAll();
        setBadge("Live", "live");
      });
      conn.on("close", () => setBadge("Disconnected", "offline"));
      conn.on("error", () => setBadge("Connection lost", "offline"));
    });
    peer.on("error", () => setBadge("Could not connect", "offline"));
  };
})();
