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

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_PATH = join(ROOT, "data", "episodes.json");
const CONFIG_PATH = join(ROOT, "scripts", "config.json");

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
    sources.push({ label: m[1].trim(), url: m[2].trim() });
  }
  return sources;
}

async function resolveChannelId(handleOrId) {
  if (/^UC[\w-]{20,}$/.test(handleOrId)) return handleOrId;
  const handle = handleOrId.startsWith("@") ? handleOrId : "@" + handleOrId.replace(/^@/, "");
  const url = `https://www.youtube.com/${handle}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (CL60 build)" } });
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

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const handle = process.env.YOUTUBE_CHANNEL || config.youtube;
  if (!handle) throw new Error("No YouTube channel set in scripts/config.json");

  console.log(`→ Resolving channel: ${handle}`);
  let channelId;
  try {
    channelId = await resolveChannelId(handle);
  } catch (err) {
    console.warn(`⚠️  ${err.message}`);
    console.warn("⚠️  Keeping existing data/episodes.json (demo/previous content) so the site still renders.");
    process.exit(0);
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  console.log(`→ Fetching feed: ${feedUrl}`);
  const res = await fetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0 (CL60 build)" } });
  if (!res.ok) {
    console.warn(`⚠️  Feed fetch failed (HTTP ${res.status}). Keeping existing data.`);
    process.exit(0);
  }
  const xml = await res.text();
  const { channelName, episodes } = parseFeed(xml);

  if (!episodes.length) {
    console.warn("⚠️  Feed had no videos. Keeping existing data.");
    process.exit(0);
  }

  const out = {
    demo: false,
    channel: {
      name: channelName,
      id: channelId,
      url: `https://www.youtube.com/channel/${channelId}`,
    },
    updated: new Date().toISOString(),
    episodes,
  };

  await writeFile(DATA_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ Wrote ${episodes.length} episodes to data/episodes.json`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
