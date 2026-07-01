# Civil Liberties in 60 Seconds — website

A fast, self-updating website for the **Civil Liberties in 60 Seconds** channel.
It pulls new episodes straight from YouTube, tags them by topic, and redeploys
itself — **no manual updates, no API keys, no Anthropic API, ever.**

## How the "automatic" part works

1. A scheduled **GitHub Action** runs every day (and on every push).
2. `scripts/build.mjs` reads the channel's **public YouTube RSS feed** (no API key,
   no quota) and rewrites `data/episodes.json`.
3. Each video is auto-tagged by topic (Free Speech, Privacy, Due Process, …) with
   keyword rules, and a 60-word summary is pulled from the video description.
4. The site is redeployed to **GitHub Pages**. Done.

When you post a new YouTube video, it appears on the site automatically within a day
(or instantly if you click **Run workflow** in the Actions tab).

## The ONE value to set

Open **`scripts/config.json`** and set your channel:

```json
{ "youtube": "@YourChannelHandle" }
```

You can use the `@handle` (preferred) **or** the `UC…` channel ID. That's the only
thing the build needs — the handle is auto-resolved to the RSS feed.

> Until you set a real channel, the site shows clearly-labeled **demo episodes** so you
> can see the design. The first successful build replaces them with your real videos.

## One-time deploy (about 3 minutes)

1. Create a GitHub repo and push this folder to the `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. (Optional) **Actions** tab → run **"Build & deploy site"** once to publish immediately.

Your site goes live at `https://<username>.github.io/<repo>/`.
To use a custom domain, add it under **Settings → Pages**.

## Run / preview locally

```bash
node scripts/build.mjs      # refresh episodes from YouTube
python3 -m http.server 8080 # then open http://localhost:8080
```

## What's in here

| Path | Purpose |
|------|---------|
| `index.html` | Homepage: hero (latest), trending strip, search, topic filters, archive |
| `episode.html` + `js/episode.js` | Per-episode page: video, summary, know-your-rights, sources, share |
| `js/app.js` | Homepage logic (loads `data/episodes.json`) |
| `css/styles.css` | Brand styling (navy / red / white, Source Sans Pro, the "60-second ruler") |
| `scripts/build.mjs` | Auto-builder: YouTube RSS → `data/episodes.json` |
| `scripts/config.json` | **The one config file** (your channel handle) |
| `.github/workflows/update.yml` | Daily auto-rebuild + deploy |
| `data/episodes.json` | Generated episode data (don't edit by hand) |

## Notes

- **Topic tags & summaries** are derived from the video title/description with simple,
  deterministic rules — no LLM involved. To improve a summary or add curated sources,
  just write them clearly in the YouTube description (e.g. a line like
  `Know your rights: ...` becomes the highlighted box, and `Label: https://url`
  lines become "Sources & further reading").
- **Newsletter & suggestion box.** Set two optional values in `scripts/config.json`:
  - `"buttondown"`: your [Buttondown](https://buttondown.com) username → the signup form
    subscribes people directly (with confirmation email). Blank = falls back to an email link.
  - `"formspree"`: your [Formspree](https://formspree.io) form ID (the part after `/f/`)
    → the "suggest a topic" box posts straight to your Formspree inbox. Blank = email link.
- Content is educational, not legal advice (noted in the footer).
