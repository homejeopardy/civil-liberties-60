/* Civil Liberties in 60 Seconds — episode detail page */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return ""; } };
const thumbUrl = (ep) => ep.thumbnail || (ep.id ? `https://i.ytimg.com/vi/${ep.id}/hqdefault.jpg` : "");
const embedUrl = (id) => `https://www.youtube.com/embed/${id}?rel=0`;
const fmtDur = (s) => {
  if (s == null || isNaN(s)) return null;
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
};

init();

async function init() {
  $("#year").textContent = new Date().getFullYear();
  const id = new URLSearchParams(location.search).get("v");

  let data = { episodes: [] };
  try { data = await (await fetch("data/episodes.json", { cache: "no-store" })).json(); } catch {}

  const url = (data.channel && data.channel.url) || "https://www.youtube.com";
  const sub = $("#yt-subscribe"); if (sub) sub.href = url;

  const eps = data.episodes || [];
  const ep = eps.find((e) => e.id === id) || eps[0];

  if (!ep) {
    $("#episode-root").innerHTML = `<p>Episode not found. <a href="index.html">Back to all episodes</a>.</p>`;
    return;
  }

  document.title = `${ep.title} — Civil Liberties in 60 Seconds`;
  render(ep, eps, url);
}

function render(ep, eps, channel) {
  const topics = ep.topics || ["Civil Liberties"];
  const watchUrl = ep.demo ? channel : `https://www.youtube.com/watch?v=${ep.id}`;
  const shareUrl = encodeURIComponent(location.href);
  const shareText = encodeURIComponent(`${ep.title} — Civil Liberties in 60 Seconds`);

  const sources = (ep.sources || []).length
    ? `<ul class="source-list">${ep.sources.map((s) => `
        <li><a href="${esc(s.url)}" target="_blank" rel="noopener">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-top:3px;flex:none"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
          <span>${esc(s.label)}</span></a></li>`).join("")}</ul>`
    : `<p style="color:#5b6680;margin:0">Sources are added with each episode.</p>`;

  const rights = ep.rights
    ? `<div class="rights-box"><b>Know your rights</b>${esc(ep.rights)}</div>`
    : "";

  const related = eps.filter((e) => e !== ep && (e.topics || []).some((t) => topics.includes(t))).slice(0, 3);
  const relatedHtml = related.length
    ? `<div class="sidebar-card related"><h4>Related episodes</h4><ul class="source-list">${related
        .map((e) => `<li><a href="episode.html?v=${encodeURIComponent(e.id)}">${esc(e.title)}</a></li>`)
        .join("")}</ul></div>`
    : "";

  $("#episode-root").innerHTML = `
    <div class="detail-grid">
      <div>
        <div class="topics">${topics.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <h1>${esc(ep.title)}</h1>
        <div style="color:#5b6680;font-weight:600;margin-bottom:16px">${fmtDate(ep.published)}${fmtDur(ep.duration) ? ` · ${fmtDur(ep.duration)}` : ""}</div>
        <div class="player">${ep.demo
          ? `<div class="video-frame placeholder" style="position:relative"><span class="play-badge">▶ 60 sec</span><div style="text-align:center;padding:24px;font-size:1.1rem">${esc(ep.title)}<div style="font-weight:600;font-size:.85rem;opacity:.8;margin-top:8px">Sample episode — your real video plays here once the channel is connected.</div></div></div>`
          : `<div class="video-frame"><iframe src="${embedUrl(ep.id)}" title="${esc(ep.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`}</div>
        <p class="summary">${esc(ep.summary || "")}</p>
        ${rights}
      </div>
      <aside>
        <div class="sidebar-card">
          <h4>Watch &amp; subscribe</h4>
          <a class="btn btn--red" style="width:100%;justify-content:center;margin-bottom:10px" href="${watchUrl}" target="_blank" rel="noopener">▶ Watch on YouTube</a>
          <a class="btn btn--navy" style="width:100%;justify-content:center" href="${channel}" target="_blank" rel="noopener">Subscribe to the channel</a>
        </div>
        <div class="sidebar-card">
          <h4>Sources &amp; further reading</h4>
          ${sources}
        </div>
        <div class="sidebar-card">
          <h4>Share this</h4>
          <div class="share-row">
            <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener" aria-label="Share on X" title="Share on X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2H21l-6.5 7.4L22 22h-6.8l-4.7-6.3L4.9 22H2l7-8L2 2h6.9l4.3 5.7zm-1.2 18h1.6L7.1 3.7H5.4z"/></svg></a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener" aria-label="Share on Facebook" title="Share on Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.5 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg></a>
            <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener" aria-label="Share on LinkedIn" title="Share on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.5 8h4V24h-4zM8 8h3.8v2.2h.1c.5-1 1.8-2.2 3.8-2.2 4 0 4.8 2.6 4.8 6V24h-4v-7c0-1.7 0-3.8-2.3-3.8s-2.7 1.8-2.7 3.7V24H8z"/></svg></a>
            <a id="copy-link" href="#" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg></a>
          </div>
        </div>
        ${relatedHtml}
      </aside>
    </div>`;

  const copy = $("#copy-link");
  if (copy) copy.addEventListener("click", (e) => {
    e.preventDefault();
    navigator.clipboard?.writeText(location.href);
    copy.setAttribute("title", "Copied!");
  });
}
