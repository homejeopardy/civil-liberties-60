#!/usr/bin/env node
/* ============================================================
   Civil Liberties in 60 Seconds — automatic episode builder
   ------------------------------------------------------------
   Pulls the channel's videos from the public YouTube RSS feed
   (no API key, no quota, no manual input) and rewrites
   data/episodes.json. Topics are auto-tagged with keyword rules.

   Run locally:   node scripts/build.mjs
   In CI:         see .github/workflows/update.yml (scheduled)
   ============================================================ */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_PATH = join(ROOT, "data", "episodes.json");
const CONFIG_PATH = join(ROOT, "scripts", "config.json");
const ASSET_V = "v=7"; // bump when css/js change so returning visitors get fresh files

/* ---- keyword → topic taxonomy (first match wins per keyword; all matches kept) ---- */
const TOPIC_RULES = [
  ["Free Speech",        ["free speech", "freespeech", "first amendment", "firstamendment", "censorship", "expression", "the press", "defamation", "libel", "book ban"]],
  ["Protest Rights",     ["protest", "assembly", "demonstrat", "march", "riot act", "right to record", "filming"]],
  ["Surveillance",       ["surveillance", "nsa", "spying", "wiretap", "facial recognition", "license plate", "tracking", "dragnet", "spyware", "fisa"]],
  ["Privacy",            ["privacy", "fourth amendment", "fourthamendment", "your data", "phone search", "encryption", "warrant"]],
  ["Due Process",        ["due process", "fifth amendment", "fifthamendment", "sixth amendment", "sixthamendment", "right to remain silent", "miranda", "plead the fifth", "jury", "death row", "counsel", "fair trial"]],
  ["Police & Policing",  ["police", "arrest", "stop and frisk", "qualified immunity", "use of force", "body cam", " cop "]],
  ["Voting Rights",      ["voting", "the vote", "ballot", "gerrymander", "election", "voter id"]],
  ["Religious Liberty",  ["religious", "religion", "establishment clause", "free exercise", "prayer in school"]],
  ["Immigration",        ["immigration", "immigrant", "#ice", "ice agent", "ice raid", "deportation", "asylum", "the border"]],
  ["Equal Protection",   ["discrimination", "equal protection", "fourteenth amendment", "fourteenthamendment", "civil rights", "segregation", "juneteenth"]],
  ["Guns & the 2nd",     ["second amendment", "secondamendment", "gun rights", "firearm", "right to bear arms"]],
];

function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function tagTopics(text) {
  const hay = text.toLowerCase();
  const hits = [];
  for (const [topic, words] of TOPIC_RULES) {
    if (words.some((w) => hay.includes(w))) hits.push(topic);
  }
  return hits.length ? hits : ["Civil Liberties"];
}

function makeSummary(desc) {
  const clean = decodeEntities(desc || "")
    .replace(/https?:\/\/\S+/g, "")          // drop URLs
    .replace(/#\w+/g, "")                      // drop hashtags
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const words = clean.split(" ");
  if (words.length <= 60) return clean;
  return words.slice(0, 60).join(" ").replace(/[.,;:]$/, "") + "…";
}

function extractRights(desc) {
  const clean = decodeEntities(desc || "");
  const m = clean.match(/know your rights[:\-]\s*(.+)/i);
  if (m) return m[1].split(/\n/)[0].trim();
  return null;
}

function extractSources(desc) {
  // Pull "Label: https://url" or bare URLs from the description as further reading.
  const clean = decodeEntities(desc || "");
  const sources = [];
  const re = /(?:^|\n)\s*([^\n:]{3,60}?):\s*(https?:\/\/\S+)/g;
  let m;
  while ((m = re.exec(clean)) && sources.length < 6) {
    const label = m[1].replace(/^[\s·•*\-–—]+/, "").replace(/\s+/g, " ").trim();
    if (label) sources.push({ label, url: m[2].trim() });
  }
  return sources;
}

async function fetchDuration(id) {
  // The RSS feed has no duration; scrape "lengthSeconds" from the watch page (no API key).
  // Hard timeout so a throttled/hung request can never stall the whole build.
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      headers: { "User-Agent": "Mozilla/5.0 (CL60 build)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

async function resolveChannelId(handleOrId) {
  if (/^UC[\w-]{20,}$/.test(handleOrId)) return handleOrId;
  const handle = handleOrId.startsWith("@") ? handleOrId : "@" + handleOrId.replace(/^@/, "");
  const url = `https://www.youtube.com/${handle}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (CL60 build)" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Could not load channel page ${url} (HTTP ${res.status})`);
  const html = await res.text();
  const m =
    html.match(/"channelId":"(UC[\w-]+)"/) ||
    html.match(/<meta itemprop="identifier" content="(UC[\w-]+)">/) ||
    html.match(/channel\/(UC[\w-]+)/);
  if (!m) throw new Error(`Channel page loaded but no channelId found for ${handle}`);
  return m[1];
}

function parseFeed(xml) {
  const channelName = (xml.match(/<title>([^<]+)<\/title>/) || [])[1] || "Civil Liberties in 60 Seconds";
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return {
    channelName: decodeEntities(channelName),
    episodes: entries.map((e) => {
      const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || "";
      const rawTitle = decodeEntities((e.match(/<title>([^<]+)<\/title>/) || [])[1] || "");
      const published = (e.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
      const description = (e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || "";
      const blob = `${rawTitle} ${decodeEntities(description)}`;
      // Clean the display title: drop hashtags and any trailing "| Channel" tail.
      const cleaned = rawTitle
        .replace(/#\S+/g, "")
        .replace(/\s*\|\s*[^|]*$/, "")
        .replace(/\s{2,}/g, " ")
        .replace(/[\s|·—-]+$/, "")
        .trim();
      return {
        id,
        title: cleaned || rawTitle,
        published,
        summary: makeSummary(description),
        topics: tagTopics(blob),
        rights: extractRights(description),
        sources: extractSources(description),
      };
    }).filter((ep) => ep.id),
  };
}

/* =================== static-site generation (SEO pages) =================== */

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const thumbLandscape = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const noCookieEmbed = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return ""; } };
const durLabel = (s) => (s == null ? "Short" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const durISO = (s) => (s == null ? undefined : `PT${Math.floor(s / 60)}M${s % 60}S`);
const clip = (s, n) => { s = (s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };

function head({ title, desc, canonical, image, ogType = "website", jsonld }) {
  const img = image || `${SITE}/assets/logo.png`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:image" content="${esc(img)}" />
  <meta property="og:site_name" content="Civil Liberties in 60 Seconds" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${esc(img)}" />
  <link rel="icon" href="/assets/favicon.png" type="image/png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@400;600;700;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css?${ASSET_V}" />
  ${(Array.isArray(jsonld) ? jsonld : jsonld ? [jsonld] : []).map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n  ")}
</head>
<body>`;
}

function header(channelUrl) {
  return `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="Civil Liberties in 60 Seconds home">
        <img class="brand-logo" src="/assets/banner.png?v=2" alt="Civil Liberties in 60 Seconds — with Professor Catherine Crump" width="2560" height="301" />
      </a>
      <nav class="nav">
        <a href="/#archive">Episodes</a>
        <a href="/#topics">Topics</a>
        <a href="/#about-catherine">About</a>
        <a href="/#engage">Subscribe</a>
        <a class="btn btn--red" href="${esc(channelUrl)}" target="_blank" rel="noopener">Watch on YouTube</a>
      </nav>
    </div>
  </header>
  <div class="ruler" aria-hidden="true"></div>`;
}

function footer() {
  return `
  <footer class="site-footer">
    <div class="wrap">
      <div class="legal">
        <p>Educational content only — not legal advice. For your specific situation, consult a licensed attorney.</p>
        <p>© <span id="year"></span> Civil Liberties in 60 Seconds · <a href="/privacy">Privacy</a></p>
      </div>
    </div>
  </footer>
  <script>document.getElementById("year").textContent=new Date().getFullYear();</script>
  <script src="/js/analytics.js?${ASSET_V}" defer></script>
</body>
</html>`;
}

function card(ep) {
  const topic = (ep.topics && ep.topics[0]) || "Civil Liberties";
  return `
    <a class="card" href="/episode/${encodeURIComponent(ep.id)}">
      <div class="thumb">
        <img src="https://i.ytimg.com/vi/${ep.id}/oardefault.jpg" alt="${esc(ep.title)}" loading="lazy"
             onerror="this.onerror=null;this.src='${thumbLandscape(ep.id)}'">
        <span class="play-badge">▶ ${durLabel(ep.duration)}</span>
      </div>
      <div class="card-body">
        <h3>${esc(ep.title)}</h3>
        <p class="snippet">${esc(clip(ep.summary, 118))}</p>
        <div class="card-meta"><span class="tag">${esc(topic)}</span><span>${fmtDate(ep.published)}</span></div>
      </div>
    </a>`;
}

function episodePage(ep, all, channelUrl) {
  const url = `${SITE}/episode/${ep.id}`;
  const desc = clip(ep.summary || ep.title, 200);
  const topics = ep.topics || ["Civil Liberties"];
  const related = all.filter((e) => e !== ep && (e.topics || []).some((t) => topics.includes(t))).slice(0, 4);
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: ep.title,
    description: desc,
    thumbnailUrl: [thumbLandscape(ep.id)],
    uploadDate: ep.published,
    duration: durISO(ep.duration),
    contentUrl: `https://www.youtube.com/watch?v=${ep.id}`,
    embedUrl: noCookieEmbed(ep.id),
    publisher: { "@type": "Organization", name: "Civil Liberties in 60 Seconds", logo: { "@type": "ImageObject", url: `${SITE}/assets/logo.png` } },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: topics[0], item: `${SITE}/topic/${slugify(topics[0])}` },
      { "@type": "ListItem", position: 3, name: ep.title, item: url },
    ],
  };
  const sources = (ep.sources || []).length
    ? `<ul class="source-list">${ep.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul>`
    : `<p style="color:#5b6680;margin:0">Sources are added with each episode.</p>`;
  const rights = ep.rights ? `<div class="rights-box"><b>Know your rights</b>${esc(ep.rights)}</div>` : "";
  const relatedHtml = related.length
    ? `<div class="sidebar-card"><h4>Related episodes</h4><ul class="source-list">${related.map((e) => `<li><a href="/episode/${e.id}">${esc(e.title)}</a></li>`).join("")}</ul></div>`
    : "";
  const shareUrl = encodeURIComponent(url);
  const shareText = encodeURIComponent(`${ep.title} — Civil Liberties in 60 Seconds`);
  return head({ title: `${ep.title} — Civil Liberties in 60 Seconds`, desc, canonical: url, image: `${SITE}/assets/og/${ep.id}.png`, ogType: "video.other", jsonld: [jsonld, breadcrumb] })
    + header(channelUrl)
    + `
  <main class="detail" id="main">
    <div class="wrap">
      <a class="back-link" href="/#archive">← All episodes</a>
      <div class="detail-grid">
        <div>
          <div class="topics">${topics.map((t) => `<a class="tag" href="/topic/${slugify(t)}">${esc(t)}</a>`).join("")}</div>
          <h1>${esc(ep.title)}</h1>
          <div style="color:#5b6680;font-weight:600;margin-bottom:16px">${fmtDate(ep.published)}${ep.duration != null ? ` · ${durLabel(ep.duration)}` : ""}</div>
          <div class="player"><div class="video-frame"><iframe src="${noCookieEmbed(ep.id)}" title="${esc(ep.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div></div>
          ${ep.summary ? `<p class="summary">${esc(ep.summary)}</p>` : ""}
          ${rights}
        </div>
        <aside>
          <div class="sidebar-card">
            <h4>Watch &amp; subscribe</h4>
            <a class="btn btn--red" style="width:100%;justify-content:center;margin-bottom:10px" href="https://www.youtube.com/watch?v=${ep.id}" target="_blank" rel="noopener">▶ Watch on YouTube</a>
            <a class="btn btn--navy" style="width:100%;justify-content:center" href="${esc(channelUrl)}" target="_blank" rel="noopener">Subscribe to the channel</a>
          </div>
          <div class="sidebar-card"><h4>Sources &amp; further reading</h4>${sources}</div>
          <div class="sidebar-card">
            <h4>Share this</h4>
            <div class="share-row">
              <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener" aria-label="Share on X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2H21l-6.5 7.4L22 22h-6.8l-4.7-6.3L4.9 22H2l7-8L2 2h6.9l4.3 5.7zm-1.2 18h1.6L7.1 3.7H5.4z"/></svg></a>
              <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener" aria-label="Share on Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.5 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg></a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener" aria-label="Share on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.5 8h4V24h-4zM8 8h3.8v2.2h.1c.5-1 1.8-2.2 3.8-2.2 4 0 4.8 2.6 4.8 6V24h-4v-7c0-1.7 0-3.8-2.3-3.8s-2.7 1.8-2.7 3.7V24H8z"/></svg></a>
            </div>
          </div>
          ${relatedHtml}
        </aside>
      </div>
    </div>
  </main>`
    + footer();
}

function topicPage(topic, episodes, channelUrl) {
  const slug = slugify(topic);
  const url = `${SITE}/topic/${slug}`;
  const desc = `60-second explainers on ${topic.toLowerCase()} from constitutional lawyer Catherine Crump. ${episodes.length} episode${episodes.length === 1 ? "" : "s"}.`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${topic} — Civil Liberties in 60 Seconds`,
    description: desc,
    url,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: topic, item: url },
    ],
  };
  return head({ title: `${topic} — Civil Liberties in 60 Seconds`, desc, canonical: url, jsonld: [jsonld, breadcrumb] })
    + header(channelUrl)
    + `
  <main id="main" class="section">
    <div class="wrap">
      <a class="back-link" href="/#archive">← All episodes</a>
      <div class="section-head"><div>
        <div class="kicker">Topic</div>
        <h2>${esc(topic)}</h2>
        <p>${esc(desc)}</p>
      </div></div>
      <div class="grid">${episodes.map(card).join("")}</div>
    </div>
  </main>`
    + footer();
}

function sitemap(data) {
  const urls = [`${SITE}/`, `${SITE}/privacy`];
  const topics = new Set();
  data.episodes.forEach((e) => (e.topics || []).forEach((t) => topics.add(t)));
  [...topics].forEach((t) => urls.push(`${SITE}/topic/${slugify(t)}`));
  data.episodes.forEach((e) => urls.push(`${SITE}/episode/${e.id}`));
  const lastmod = (data.updated || "").slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

let SITE = ""; // set in main() from config.siteUrl

async function generateSite(data, channelUrl) {
  const epDir = join(ROOT, "episode");
  const topicDir = join(ROOT, "topic");
  await rm(epDir, { recursive: true, force: true });
  await rm(topicDir, { recursive: true, force: true });
  await mkdir(epDir, { recursive: true });
  await mkdir(topicDir, { recursive: true });

  const eps = data.episodes || [];
  await Promise.all(eps.map((ep) => writeFile(join(epDir, `${ep.id}.html`), episodePage(ep, eps, channelUrl))));

  const byTopic = new Map();
  eps.forEach((ep) => (ep.topics || []).forEach((t) => {
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t).push(ep);
  }));
  await Promise.all([...byTopic].map(([t, list]) => writeFile(join(topicDir, `${slugify(t)}.html`), topicPage(t, list, channelUrl))));

  await writeFile(join(ROOT, "sitemap.xml"), sitemap(data));
  await writeFile(join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  console.log(`✓ Generated ${eps.length} episode pages, ${byTopic.size} topic pages, sitemap.xml, robots.txt`);
}

/* ============================== main ============================== */

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  SITE = (config.siteUrl || "").replace(/\/$/, "");
  const handle = process.env.YOUTUBE_CHANNEL || config.youtube;
  if (!handle) throw new Error("No YouTube channel set in scripts/config.json");

  // Try to refresh episodes.json from YouTube; on any failure, keep existing data.
  try {
    console.log(`→ Resolving channel: ${handle}`);
    const channelId = await resolveChannelId(handle);
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    console.log(`→ Fetching feed: ${feedUrl}`);
    const res = await fetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0 (CL60 build)" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const { channelName, episodes } = parseFeed(await res.text());
    if (!episodes.length) throw new Error("feed had no videos");

    console.log(`→ Fetching real durations for ${episodes.length} videos…`);
    await Promise.all(episodes.map(async (ep) => { ep.duration = await fetchDuration(ep.id); }));

    const out = {
      demo: false,
      channel: { name: channelName, id: channelId, url: `https://www.youtube.com/channel/${channelId}` },
      updated: new Date().toISOString(),
      episodes,
    };
    await writeFile(DATA_PATH, JSON.stringify(out, null, 2) + "\n");
    console.log(`✓ Wrote ${episodes.length} episodes to data/episodes.json`);
  } catch (err) {
    console.warn(`⚠️  Could not refresh from YouTube (${err.message}); using existing data/episodes.json.`);
  }

  // Always (re)generate the static pages from whatever data we have now.
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const channelUrl = (data.channel && data.channel.url) || "https://www.youtube.com";
  await generateSite(data, channelUrl);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
