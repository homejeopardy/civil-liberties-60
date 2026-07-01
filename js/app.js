/* Civil Liberties in 60 Seconds — homepage logic
   Loads data/episodes.json (rebuilt automatically from YouTube) and renders
   the hero, trending strip, topic filters, search, and archive grid.
   No backend, no API keys, no manual input. */

const CONTACT = "ccrump@clinical.law.berkeley.edu";

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
};
const thumbUrl = (ep) => ep.demo ? "" : (ep.thumbnail || (ep.id ? `https://i.ytimg.com/vi/${ep.id}/hqdefault.jpg` : ""));
const embedUrl = (id) => `https://www.youtube.com/embed/${id}?rel=0`;
const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let DATA = { episodes: [] };
let activeTopic = "All";
let query = "";

init();

async function init() {
  try {
    const res = await fetch("data/episodes.json", { cache: "no-store" });
    DATA = await res.json();
  } catch (e) {
    DATA = { episodes: [] };
  }
  const eps = DATA.episodes || [];

  wireChannelLinks();
  $("#year").textContent = new Date().getFullYear();

  if (DATA.demo) showDemoBanner();

  renderHero(eps[0]);
  renderTrending(eps.slice(0, 3));
  renderFilters(eps);
  renderArchive();

  $("#search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderArchive(); });
  wireForms();
}

function channelUrl() {
  return (DATA.channel && DATA.channel.url) || "https://www.youtube.com/results?search_query=civil+liberties+in+60+seconds";
}

function wireChannelLinks() {
  const url = channelUrl();
  ["#yt-subscribe", "#yt-subscribe-2", "#yt-subscribe-3"].forEach((sel) => {
    const el = $(sel); if (el) el.href = url;
  });
  $("#social").innerHTML = `
    <a href="${url}" target="_blank" rel="noopener" aria-label="YouTube" title="YouTube">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5 31 31 0 0 0 .6 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4A3 3 0 0 0 23 16.5 31 31 0 0 0 23.4 12 31 31 0 0 0 23 7.5zM9.8 15.3V8.7l5.7 3.3z"/></svg>
    </a>
    <a href="mailto:${CONTACT}" aria-label="Email" title="Email">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
    </a>`;
}

function showDemoBanner() {
  $("#demo-banner").innerHTML = `<div class="demo-banner">👋 <b>Preview mode:</b> showing sample episodes. Set your channel handle in <code>scripts/config.json</code> and the real videos load automatically.</div>`;
}

function renderHero(ep) {
  const host = $("#hero-video");
  if (!ep) {
    host.innerHTML = `<div class="video-frame" style="display:flex;align-items:center;justify-content:center;color:#9fb0d8;text-align:center;padding:24px">New episodes will appear here automatically.</div>`;
    return;
  }
  const frame = ep.demo
    ? `<div class="video-frame placeholder" style="position:relative"><span class="play-badge">▶ 60 sec</span><div style="text-align:center;padding:24px">${esc(ep.title)}</div></div>`
    : `<div class="video-frame"><iframe src="${embedUrl(ep.id)}" title="${esc(ep.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  host.innerHTML = `
    ${frame}
    <a class="meta" href="episode.html?v=${encodeURIComponent(ep.id)}" style="text-decoration:none;color:#fff;display:block">
      <b>Latest: ${esc(ep.title)}</b>
      <span>${fmtDate(ep.published)} · ${(ep.topics || ["Civil Liberties"]).slice(0,2).join(" · ")}</span>
    </a>`;
}

function card(ep, trending = false) {
  const t = thumbUrl(ep);
  const thumbInner = t
    ? `<img src="${t}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="placeholder" style="display:none">${esc(ep.title)}</div>`
    : `<div class="placeholder" style="display:flex">${esc(ep.title)}</div>`;
  const topic = (ep.topics && ep.topics[0]) || "Civil Liberties";
  return `
    <a class="card" href="episode.html?v=${encodeURIComponent(ep.id)}">
      <div class="thumb">
        ${thumbInner}
        <span class="play-badge">▶ 60 sec</span>
      </div>
      <div class="card-body">
        <h3>${esc(ep.title)}</h3>
        <p class="snippet">${esc((ep.summary || "").slice(0, 120))}${(ep.summary || "").length > 120 ? "…" : ""}</p>
        <div class="card-meta">
          <span class="tag ${trending ? "trending" : ""}">${trending ? "🔥 Trending" : esc(topic)}</span>
          <span>${fmtDate(ep.published)}</span>
        </div>
      </div>
    </a>`;
}

function renderTrending(eps) {
  const grid = $("#trending-grid");
  if (!eps.length) { $("#trending").style.display = "none"; return; }
  grid.innerHTML = eps.map((ep) => card(ep, true)).join("");
}

function renderFilters(eps) {
  const topics = new Set();
  eps.forEach((ep) => (ep.topics || []).forEach((t) => topics.add(t)));
  const all = ["All", ...[...topics].sort()];
  $("#filters").innerHTML = all
    .map((t) => `<button class="chip" data-topic="${esc(t)}" aria-pressed="${t === activeTopic}">${esc(t)}</button>`)
    .join("");
  $$("#filters .chip").forEach((b) =>
    b.addEventListener("click", () => {
      activeTopic = b.dataset.topic;
      $$("#filters .chip").forEach((x) => x.setAttribute("aria-pressed", x.dataset.topic === activeTopic));
      renderArchive();
    })
  );
}

function renderArchive() {
  const grid = $("#archive-grid");
  let eps = DATA.episodes || [];
  if (activeTopic !== "All") eps = eps.filter((ep) => (ep.topics || []).includes(activeTopic));
  if (query) {
    eps = eps.filter((ep) =>
      (`${ep.title} ${ep.summary} ${(ep.topics || []).join(" ")}`).toLowerCase().includes(query)
    );
  }
  if (!eps.length) {
    grid.innerHTML = `<div class="empty"><b>No episodes match.</b>Try a different search or topic — or new episodes may still be on the way.</div>`;
    return;
  }
  grid.innerHTML = eps.map((ep) => card(ep)).join("");
}

function wireForms() {
  $("#subscribe-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const subject = encodeURIComponent("Subscribe me to the Civil Liberties digest");
    const body = encodeURIComponent(`Please add this address to the Tuesday & Thursday digest:\n\n${email}`);
    window.location.href = `mailto:${CONTACT}?subject=${subject}&body=${body}`;
  });
  $("#suggest-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const idea = e.target.idea.value.trim();
    const subject = encodeURIComponent("Topic idea for Civil Liberties in 60 Seconds");
    const body = encodeURIComponent(idea);
    window.location.href = `mailto:${CONTACT}?subject=${subject}&body=${body}`;
  });
}
