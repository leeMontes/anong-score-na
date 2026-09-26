(() => {
  const App = (window.App = window.App || {});

  const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif';
  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';

  function palette() {
    const dark = document.body.dataset.theme === "dark";
    return dark
      ? { bg: "#1c1c1e", text: "#f5f5f7", text2: "#aeaeb2", text3: "#8e8e93", hairline: "#38383a", accent: "#30d158", accentInk: "#30d158" }
      : { bg: "#ffffff", text: "#1d1d1f", text2: "#6e6e73", text3: "#8e8e93", hairline: "#d2d2d7", accent: "#34c759", accentInk: "#248a3d" };
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let trimmed = text;
    while (trimmed.length > 1 && ctx.measureText(trimmed + "…").width > maxWidth) trimmed = trimmed.slice(0, -1);
    return trimmed + "…";
  }

  function buildCanvas(session) {
    const p = palette();
    const width = 720;
    const pad = 40;
    const contentWidth = width - pad * 2;
    const scale = 2;
    const perMatch = 74;
    const perStanding = 40;

    const matchCount = session.matches.length;
    const standings = App.computeStandings(session.players, session.matches);
    const standingCount = standings.length;

    let height = pad;
    height += 22 + 6;
    height += 46 + 6;
    height += 26 + 26;
    height += 1 + 24;
    height += 22 + 14;
    height += matchCount * perMatch + 18;
    height += 22 + 14;
    height += standingCount * perStanding + 18;
    height += 22;
    height += pad;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, width, height);

    let y = pad;

    ctx.fillStyle = p.accent;
    ctx.font = `700 15px ${SANS}`;
    ctx.fillText("ANONG SCORE NA?", pad, y + 16);
    y += 22 + 6;

    ctx.fillStyle = p.text;
    ctx.font = `800 44px ${SANS}`;
    ctx.fillText(App.dateLabel(session.dateISO), pad, y + 40);
    y += 46 + 6;

    const time = new Date(session.wrappedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    ctx.fillStyle = p.text2;
    ctx.font = `500 20px ${SANS}`;
    ctx.fillText(`${matchCount} match${matchCount === 1 ? "" : "es"} · wrapped at ${time}`, pad, y + 20);
    y += 26 + 26;

    ctx.strokeStyle = p.hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
    y += 24;

    const sectionLabel = (label) => {
      ctx.textAlign = "left";
      ctx.fillStyle = p.text3;
      ctx.font = `700 14px ${SANS}`;
      ctx.fillText(label, pad, y + 16);
      y += 22 + 14;
    };

    sectionLabel("MATCH SCHEDULE");
    const columnWidth = contentWidth / 2 - 60;
    session.matches.forEach((match) => {
      const names = App.namesForMatchIn(session.players, match);
      const nameBaseline = y + 21;
      ctx.fillStyle = p.text;
      ctx.font = `600 20px ${SANS}`;
      ctx.textAlign = "left";
      ctx.fillText(fitText(ctx, names.left, columnWidth), pad, nameBaseline);
      ctx.textAlign = "right";
      ctx.fillText(fitText(ctx, names.right, columnWidth), width - pad, nameBaseline);
      ctx.textAlign = "center";
      ctx.font = `600 22px ${MONO}`;
      ctx.fillText(`${match.scoreA}—${match.scoreB}`, width / 2, nameBaseline);
      ctx.textAlign = "left";
      const winnerName = match.winner === "A" ? names.left : names.right;
      const durationText = match.durationSeconds ? ` · ${App.formatTime(match.durationSeconds * 1000)}` : "";
      ctx.fillStyle = p.accentInk;
      ctx.font = `600 15px ${SANS}`;
      ctx.fillText(`${winnerName} won · ${match.mode === "doubles" ? "Doubles" : "Singles"}${durationText}`, pad, nameBaseline + 24);
      y += perMatch;
    });
    y += 18;

    sectionLabel("STANDINGS");
    const medals = ["🥇", "🥈", "🥉"];
    standings.forEach((entry, index) => {
      const rowTop = y;
      const rowMid = rowTop + 26;
      ctx.textAlign = "left";
      if (index < 3) {
        ctx.font = `24px ${SANS}`;
        ctx.fillStyle = p.text;
        ctx.fillText(medals[index], pad, rowMid + 2);
      } else {
        ctx.font = `600 15px ${MONO}`;
        ctx.fillStyle = p.text3;
        ctx.fillText(String(index + 1).padStart(2, "0"), pad, rowMid);
      }
      ctx.fillStyle = p.text;
      ctx.font = `600 20px ${SANS}`;
      ctx.fillText(fitText(ctx, entry.player.name, contentWidth - 44 - 150), pad + 46, rowMid);
      ctx.textAlign = "right";
      ctx.fillStyle = p.text2;
      ctx.font = `500 18px ${MONO}`;
      ctx.fillText(`${entry.wins}—${entry.losses}`, width - pad - 96, rowMid);
      ctx.fillStyle = p.accentInk;
      ctx.font = `700 18px ${MONO}`;
      ctx.fillText(`${Math.round(entry.rate * 100)}%`, width - pad, rowMid);
      ctx.textAlign = "left";
      y += perStanding;
      ctx.strokeStyle = p.hairline;
      ctx.beginPath();
      ctx.moveTo(pad, rowTop + perStanding - 8);
      ctx.lineTo(width - pad, rowTop + perStanding - 8);
      ctx.stroke();
    });
    y += 18;

    ctx.fillStyle = p.text3;
    ctx.font = `500 14px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("Generated by Anong Score Na?", width / 2, y + 14);
    ctx.textAlign = "left";

    return canvas;
  }

  App.saveSessionScreenshot = function saveSessionScreenshot(sessionId) {
    const session = App.state.sessions.find((item) => item.id === sessionId);
    if (!session) {
      App.showToast("Session not found.");
      return;
    }
    const canvas = buildCanvas(session);
    const filename = `anong-score-na-${session.dateISO}.png`;
    canvas.toBlob(async (blob) => {
      if (!blob) {
        App.showToast("Could not create the image.");
        return;
      }
      const file = new File([blob], filename, { type: "image/png" });
      let canShare = false;
      try {
        canShare = Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
      } catch { canShare = false; }
      if (canShare) {
        try {
          await navigator.share({ files: [file], title: "Anong Score Na? — Session" });
          return;
        } catch (error) {
          if (error && error.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      App.showToast("Screenshot saved.");
    }, "image/png");
  };
})();
