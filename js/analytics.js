/* Cookieless, privacy-respecting analytics (GoatCounter) — loaded only if configured.
   No cookies, no cross-site tracking, no personal data. Reads the code from
   scripts/config.json so there's one place to set it. */
(async () => {
  try {
    const cfg = await (await fetch("/scripts/config.json", { cache: "no-store" })).json();
    const code = cfg && cfg.analytics && cfg.analytics.goatcounter;
    if (!code) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = "//gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", `https://${code}.goatcounter.com/count`);
    document.head.appendChild(s);
  } catch {
    /* analytics is best-effort; never break the page */
  }
})();
