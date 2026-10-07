// Silk can use a desktop user agent. ?tv=1 also enables the TV layout explicitly.
(function () {
  const tvSetting = new URLSearchParams(window.location.search).get("tv");
  const enabled = tvSetting === "1" || (tvSetting !== "0" && /\bAFT[\w-]*\b|Fire\s?TV/i.test(navigator.userAgent));
  const root = document.documentElement;
  const controlSelector = 'button, a[href], input, select, textarea, [tabindex]';

  function updateViewport() {
    const width = window.innerWidth;
    const height = Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
    root.style.setProperty("--tv-height", `${Math.round(height)}px`);
    root.style.setProperty("--tv-safe-x", `${Math.round(width * 0.05)}px`);
    root.style.setProperty("--tv-safe-y", `${Math.round(height * 0.05)}px`);
  }

  function focusControl(element, scroll = true) {
    if (!element) return;
    try { element.focus({ preventScroll: true }); } catch { element.focus(); }
    if (scroll) element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function controls() {
    return Array.from(document.querySelectorAll(controlSelector)).filter((element) => {
      if (element.disabled || element.tabIndex < 0 || element.closest('[hidden], .hidden, [inert], [aria-hidden="true"]')) return false;
      // Older host markup contains a button inside a link; use one focus target.
      if (element.tagName === "A" && element.querySelector("button")) return false;
      const style = getComputedStyle(element);
      return element.getClientRects().length && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
    });
  }

  function isEditable(element) {
    return element?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName || "");
  }

  function moveFocus(direction) {
    const candidates = controls();
    const active = document.activeElement;
    if (!candidates.includes(active)) {
      focusControl(candidates[0]);
      return Boolean(candidates.length);
    }
    const rect = active.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    let nearest = null;
    let bestScore = Infinity;
    candidates.forEach((candidate) => {
      if (candidate === active) return;
      const bounds = candidate.getBoundingClientRect();
      const dx = bounds.left + bounds.width / 2 - origin.x;
      const dy = bounds.top + bounds.height / 2 - origin.y;
      const horizontal = direction === "ArrowLeft" || direction === "ArrowRight";
      const primary = horizontal ? dx : dy;
      const forward = direction === "ArrowLeft" || direction === "ArrowUp" ? -primary : primary;
      if (forward <= 1) return;
      const sideways = Math.abs(horizontal ? dy : dx);
      const score = forward + sideways * 3 + sideways * sideways / forward;
      if (score < bestScore) { bestScore = score; nearest = candidate; }
    });
    focusControl(nearest);
    return Boolean(nearest);
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  function fullscreenRequest() {
    return root.requestFullscreen || root.webkitRequestFullscreen;
  }

  function updateFullscreenButtons() {
    document.querySelectorAll("[data-tv-fullscreen]").forEach((button) => {
      button.textContent = fullscreenElement() ? "Exit fullscreen" : fullscreenRequest() ? "Fullscreen" : "Fit screen";
      button.setAttribute("aria-pressed", String(Boolean(fullscreenElement())));
    });
    updateViewport();
  }

  function fitScreen() {
    updateViewport();
    window.dispatchEvent(new Event("resize"));
    document.querySelectorAll("[data-tv-screen-status]").forEach((status) => {
      status.textContent = "Screen fitted. Hide Silk's toolbar for more space.";
    });
  }

  async function toggleFullscreen() {
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else if (fullscreenRequest()) {
        await fullscreenRequest().call(root);
      } else {
        fitScreen();
      }
    } catch {
      // Some Silk builds do not permit the Fullscreen API; the viewport fit still works.
      fitScreen();
    }
    updateFullscreenButtons();
  }

  function pageUrl(path) {
    const url = new URL(path, window.location.origin);
    if (enabled) url.searchParams.set("tv", "1");
    return url.href;
  }

  window.BingoTV = {
    enabled,
    focusControl,
    openPage(path) {
      if (enabled) window.location.assign(pageUrl(path));
      else window.open(path, "_blank", "noopener");
    },
  };
  if (!enabled) return;
  root.classList.add("fire-tv");
  updateViewport();
  window.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.addEventListener("pageshow", updateViewport);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateViewport(); });

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-tv-controls]").forEach((toolbar) => { toolbar.hidden = false; });
    document.querySelectorAll("[data-tv-fullscreen]").forEach((button) => { button.addEventListener("click", toggleFullscreen); });
    document.querySelectorAll('a[target="_blank"], a[data-tv-page]').forEach((link) => {
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      link.removeAttribute("target");
      // Only the host and display pages use this TV configuration.
      if (/^\/(host|display)?\/?$/.test(url.pathname)) link.href = pageUrl(url.href);
    });
    updateFullscreenButtons();
    focusControl(document.querySelector("[data-tv-fullscreen]"), false);
  });
  document.addEventListener("fullscreenchange", updateFullscreenButtons);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButtons);
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditable(event.target) || isEditable(document.activeElement)) return;
    // Silk's cursor and pointer clicks keep working. This supplements keyboard/D-pad focus.
    const direction = event.key || ({ 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown" })[event.keyCode];
    if (/^Arrow(Left|Right|Up|Down)$/.test(direction || "") && moveFocus(direction)) event.preventDefault();
  });
})();
