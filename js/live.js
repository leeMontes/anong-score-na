(() => {
  const App = (window.App = window.App || {});

  App.isViewer = false;

  let hostPeer = null;
  let hostConnections = [];
  let hostTimer = null;
  let hostAttempts = 0;

  let viewerPeer = null;
  let viewerConn = null;
  let viewerTimer = null;

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

  function getViewerId() {
    let id = "";
    try { id = sessionStorage.getItem("anong-viewer-id") || ""; } catch { id = ""; }
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem("anong-viewer-id", id); } catch { /* ignore */ }
    }
    return id;
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
    const label = App.$("#go-live-label");
    if (label) label.textContent = count ? `Live · ${count} watching` : "You're live";
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

  function connectionIdentity(conn) {
    return (conn.metadata && conn.metadata.viewerId) || conn.peer;
  }

  function handleConnection(conn) {
    const identity = connectionIdentity(conn);
    const stale = hostConnections.filter((item) => connectionIdentity(item) === identity);
    stale.forEach((item) => { try { item.close(); } catch { /* ignore */ } });
    hostConnections = hostConnections.filter((item) => connectionIdentity(item) !== identity);
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

  function openLiveDialog() {
    const dialog = App.$("#live-dialog");
    if (dialog && !dialog.open) dialog.showModal();
  }

  function setLiveModalState(isLive) {
    const body = App.$("#live-body");
    if (body) body.hidden = !isLive;
    const note = App.$("#live-off-note");
    if (note) note.hidden = isLive;
    const toggle = App.$("#live-switch");
    if (toggle) toggle.setAttribute("aria-checked", isLive ? "true" : "false");
  }

  function scheduleHostRetry(roomId, sameId) {
    clearTimeout(hostTimer);
    if (hostAttempts >= 8) {
      App.showToast("Live share lost connection. Toggle live sharing to retry.");
      return;
    }
    hostAttempts += 1;
    hostTimer = setTimeout(() => {
      if (!hostPeer) host(sameId ? roomId : makeRoomId(), sameId);
    }, 1500 * hostAttempts);
  }

  function host(roomId, isRecovery) {
    const peer = new window.Peer(roomId, { debug: 1 });
    peer.on("open", () => {
      hostPeer = peer;
      hostAttempts = 0;
      renderQr(viewerUrl(roomId));
      const button = App.$("#go-live");
      if (button) button.classList.add("is-live");
      setLiveModalState(true);
      updateHostUi();
      App.showToast("You're live — scan the QR to watch.");
    });
    peer.on("connection", handleConnection);
    peer.on("disconnected", () => {
      if (hostPeer !== peer || peer.destroyed) return;
      setTimeout(() => {
        if (hostPeer === peer && peer.disconnected && !peer.destroyed) {
          try { peer.reconnect(); } catch { /* ignore */ }
        }
      }, 1200);
    });
    peer.on("close", () => {
      if (hostPeer !== peer) return;
      hostPeer = null;
      scheduleHostRetry(roomId, true);
    });
    peer.on("error", (error) => {
      const type = error && error.type;
      if (type === "unavailable-id") {
        if (isRecovery) scheduleHostRetry(roomId, true);
        else host(makeRoomId(), false);
        return;
      }
      if (!hostPeer) scheduleHostRetry(isRecovery ? roomId : makeRoomId(), isRecovery);
    });
  }

  App.openLiveModal = function openLiveModal() {
    if (App.isViewer) return;
    setLiveModalState(Boolean(hostPeer));
    if (hostPeer) updateHostUi();
    openLiveDialog();
  };

  App.toggleLive = function toggleLive() {
    if (App.isViewer) return;
    if (hostPeer) {
      App.stopLiveShare();
      return;
    }
    hostAttempts = 0;
    host(makeRoomId(), false);
  };

  App.stopLiveShare = function stopLiveShare() {
    if (App.isViewer) return;
    clearTimeout(hostTimer);
    hostAttempts = 0;
    hostConnections.forEach((conn) => { try { conn.close(); } catch { /* ignore */ } });
    hostConnections = [];
    if (hostPeer) {
      try { hostPeer.destroy(); } catch { /* ignore */ }
    }
    hostPeer = null;
    setLiveModalState(false);
    const button = App.$("#go-live");
    if (button) button.classList.remove("is-live");
    const label = App.$("#go-live-label");
    if (label) label.textContent = "Go live";
    const badge = App.$("#live-badge");
    if (badge) badge.hidden = true;
    App.showToast("Stopped sharing.");
  };

  function scheduleViewerRetry(roomId) {
    clearTimeout(viewerTimer);
    viewerTimer = setTimeout(() => viewerConnect(roomId), 2500);
  }

  function dialHost(roomId) {
    if (!viewerPeer || !viewerPeer.open) {
      scheduleViewerRetry(roomId);
      return;
    }
    if (viewerConn) {
      try { viewerConn.close(); } catch { /* ignore */ }
      viewerConn = null;
    }
    const conn = viewerPeer.connect(roomId, { reliable: true, metadata: { viewerId: getViewerId() } });
    viewerConn = conn;
    conn.on("open", () => setBadge("Live", "live"));
    conn.on("data", (payload) => {
      if (!payload || payload.type !== "state" || !payload.state) return;
      App.state = payload.state;
      App.renderAll();
      setBadge("Live", "live");
    });
    conn.on("close", () => {
      setBadge("Reconnecting…", "connecting");
      scheduleViewerRetry(roomId);
    });
    conn.on("error", () => {
      setBadge("Reconnecting…", "connecting");
      scheduleViewerRetry(roomId);
    });
  }

  function viewerConnect(roomId) {
    clearTimeout(viewerTimer);
    if (!viewerPeer || viewerPeer.destroyed) {
      viewerPeer = new window.Peer({ debug: 1 });
      viewerPeer.on("open", () => dialHost(roomId));
      viewerPeer.on("disconnected", () => {
        setTimeout(() => {
          if (viewerPeer && viewerPeer.disconnected && !viewerPeer.destroyed) {
            try { viewerPeer.reconnect(); } catch { /* ignore */ }
          }
        }, 1200);
      });
      viewerPeer.on("error", () => scheduleViewerRetry(roomId));
    } else if (viewerPeer.open) {
      dialHost(roomId);
    } else {
      scheduleViewerRetry(roomId);
    }
  }

  App.initLiveViewer = function initLiveViewer(roomId) {
    App.isViewer = true;
    document.body.classList.add("viewer");
    setBadge("Connecting…", "connecting");
    viewerConnect(roomId);
  };
})();
