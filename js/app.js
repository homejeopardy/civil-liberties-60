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
// Shorts are vertical: oardefault.jpg is the true portrait thumbnail (fallback to hqdefault).
const thumbUrl = (ep) => ep.demo ? "" : (ep.thumbnail || (ep.id ? `https://i.ytimg.com/vi/${ep.id}/oardefault.jpg` : ""));
const thumbFallback = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
const epUrl = (id) => `episode/${encodeURIComponent(id)}.html`;
const fmtDur = (s) => {
  if (s == null || isNaN(s)) return "Short";
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
};
const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let DATA = { episodes: [] };
let CONFIG = {};
let activeTopic = "All";
let query = "";

init();

async function init() {
  const [dataRes, cfgRes] = await Promise.allSettled([
    fetch("data/episodes.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("scripts/config.json", { cache: "no-store" }).then((r) => r.json()),
  ]);
  DATA = dataRes.status === "fulfilled" ? dataRes.value : { episodes: [] };
  CONFIG = cfgRes.status === "fulfilled" ? cfgRes.value : {};
  const eps = DATA.episodes || [];

  wireChannelLinks();
  $("#year").textContent = new Date().getFullYear();

  if (DATA.demo) showDemoBanner();

  renderHero(eps[0]);
  renderTrending(eps.slice(0, 3));
  renderFilters(eps);
  renderArchive();
  renderFooterTopics(eps);

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
  const icons = {
    youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5 31 31 0 0 0 .6 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4A3 3 0 0 0 23 16.5 31 31 0 0 0 23.4 12 31 31 0 0 0 23 7.5zM9.8 15.3V8.7l5.7 3.3z"/></svg>`,
    tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.8a4.3 4.3 0 0 1-1-2.8h-3.1v12.4a2.5 2.5 0 1 1-2.5-2.5c.26 0 .5.04.74.11V9.85a5.6 5.6 0 0 0-.74-.05 5.6 5.6 0 1 0 5.6 5.6V9.01a7.3 7.3 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.3-1.5z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.5 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>`,
    email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  };
  const social = CONFIG.social || {};
  const links = [
    { key: "youtube", href: url, label: "YouTube" },
    { key: "tiktok", href: social.tiktok, label: "TikTok" },
    { key: "instagram", href: social.instagram, label: "Instagram" },
    { key: "facebook", href: social.facebook, label: "Facebook" },
    { key: "email", href: `mailto:${CONFIG.contactEmail || CONTACT}`, label: "Email" },
  ];
  $("#social").innerHTML = links
    .filter((l) => l.href && l.href.trim())
    .map((l) => {
      const external = l.key !== "email" ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${l.href}"${external} aria-label="${l.label}" title="${l.label}">${icons[l.key]}</a>`;
    })
    .join("");
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
    <a class="meta" href="${epUrl(ep.id)}" style="text-decoration:none;color:#fff;display:block">
      <b>Latest: ${esc(ep.title)}</b>
      <span>${fmtDate(ep.published)} · ${(ep.topics || ["Civil Liberties"]).slice(0,2).join(" · ")}</span>
    </a>`;
}

function card(ep, trending = false) {
  const t = thumbUrl(ep);
  const thumbInner = t
    ? `<img src="${t}" alt="" loading="lazy" data-fb="${ep.id ? thumbFallback(ep.id) : ""}" onerror="if(this.dataset.fb){this.src=this.dataset.fb;this.dataset.fb='';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}"><div class="placeholder" style="display:none">${esc(ep.title)}</div>`
    : `<div class="placeholder" style="display:flex">${esc(ep.title)}</div>`;
  const topic = (ep.topics && ep.topics[0]) || "Civil Liberties";
  return `
    <a class="card" href="${epUrl(ep.id)}">
      <div class="thumb">
        ${thumbInner}
        <span class="play-badge">▶ ${fmtDur(ep.duration)}</span>
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

const topicSlug = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function renderFooterTopics(eps) {
  const el = $("#footer-topics");
  if (!el) return;
  const topics = new Set();
  eps.forEach((ep) => (ep.topics || []).forEach((t) => topics.add(t)));
  if (!topics.size) return;
  el.innerHTML = `<span class="footer-topics-label">Browse by topic:</span> ` +
    [...topics].sort().map((t) => `<a href="topic/${topicSlug(t)}.html">${esc(t)}</a>`).join("");
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

function formMessage(form, html) {
  form.innerHTML = `<p class="form-success">${html}</p>`;
}

function wireForms() {
  const contact = CONFIG.contactEmail || CONTACT;
  const buttondown = (CONFIG.buttondown || "").trim();
  const formspree = (CONFIG.formspree || "").trim();

  // --- Newsletter signup: Buttondown if configured, else a plain email link ---
  const subscribe = $("#subscribe-form");
  subscribe.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = subscribe.email.value.trim();
    if (!email) return;
    if (buttondown) {
      const fd = new FormData();
      fd.append("email", email);
      // no-cors: the request is delivered to Buttondown; we can't read the opaque
      // response, so we optimistically confirm. Buttondown then emails to confirm.
      fetch(`https://buttondown.com/api/emails/embed-subscribe/${buttondown}`, {
        method: "POST",
        mode: "no-cors",
        body: fd,
      }).finally(() =>
        formMessage(subscribe, "🎉 Almost there! Check your inbox and click the link to confirm.")
      );
    } else {
      const subject = encodeURIComponent("Subscribe me to the Civil Liberties digest");
      const body = encodeURIComponent(`Please add this address to the Tuesday & Thursday digest:\n\n${email}`);
      window.location.href = `mailto:${contact}?subject=${subject}&body=${body}`;
    }
  });

  // --- Suggest a topic: Formspree if configured, else a plain email link ---
  const suggest = $("#suggest-form");
  suggest.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idea = suggest.idea.value.trim();
    if (!idea) return;
    if (formspree) {
      try {
        const res = await fetch(`https://formspree.io/f/${formspree}`, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new FormData(suggest),
        });
        formMessage(
          suggest,
          res.ok
            ? "💡 Thanks! Your idea just landed in our inbox."
            : `Sorry, something went wrong. Please email <a href="mailto:${contact}" style="color:#fff">us directly</a>.`
        );
      } catch {
        formMessage(suggest, `Sorry, something went wrong. Please email <a href="mailto:${contact}" style="color:#fff">us directly</a>.`);
      }
    } else {
      const subject = encodeURIComponent("Topic idea for Civil Liberties in 60 Seconds");
      const body = encodeURIComponent(idea);
      window.location.href = `mailto:${contact}?subject=${subject}&body=${body}`;
    }
  });
}
