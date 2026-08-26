const OPE_MYSTERY_BASE = "/murder-mystery";

const stationGrid = document.querySelector("#stationPrintGrid");

function escapeStationHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function loadStationCards() {
  const response = await fetch(`${OPE_MYSTERY_BASE}/api/stations`);
  const data = await response.json();
  stationGrid.innerHTML = data.stations
    .map((station) => {
      const url = `${location.origin}${station.path}`;
      let qrMarkup = `<div class="qr-fallback">${url}</div>`;
      try {
        const qr = qrcode(0, "M");
        qr.addData(url);
        qr.make();
        qrMarkup = qr.createImgTag(5, 8);
      } catch {
        qrMarkup = `<div class="qr-fallback">${url}</div>`;
      }
      return `
        <article class="station-print-card">
          <div class="station-print-card-top">
            <span>Stop ${Number(station.stop)} &bull; Crime Chapter ${Number(station.act)}</span>
            <strong>${escapeStationHtml(station.routeLabel)}</strong>
          </div>
          <img class="station-print-logo" src="${OPE_MYSTERY_BASE}/assets/on-par/on-par-logo-white.png" alt="On Par Entertainment" />
          <small class="station-print-anchor">${escapeStationHtml(station.tourAnchor)}</small>
          <h2>${escapeStationHtml(station.title)}</h2>
          <p>${escapeStationHtml(station.guestLocation || station.location)}</p>
          <div class="station-print-qr">${qrMarkup}</div>
          <p class="station-print-flow">Watch &bull; Inspect &bull; Deduce &bull; Secure</p>
          <p class="station-print-prompt">${escapeStationHtml(station.prompt)}</p>
          <p class="station-print-safety">${escapeStationHtml(station.safety)}</p>
          <small>${url}</small>
        </article>
      `;
    })
    .join("");
}

loadStationCards();
