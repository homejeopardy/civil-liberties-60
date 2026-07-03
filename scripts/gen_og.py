#!/usr/bin/env python3
"""
Generate branded social share cards (Open Graph images) for each episode.

Reads data/episodes.json and writes assets/og/<id>.png (1200x630) plus a
home card assets/og/home.png. Run after scripts/build.mjs. Requires Pillow.

  python3 scripts/gen_og.py
"""
from __future__ import annotations
import json, os, textwrap
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT_PATH = os.path.join(ROOT, "assets", "fonts", "SourceSans3.ttf")
OUT_DIR = os.path.join(ROOT, "assets", "og")

NAVY = (0, 38, 118)
RED = (255, 49, 49)
WHITE = (255, 255, 255)
MUTED = (174, 187, 224)

W, H = 1200, 630
MARGIN = 84


def font(size, weight="Bold"):
    f = ImageFont.truetype(FONT_PATH, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def draw_ruler(d, x0, x1, y):
    # the "60-second tape" motif: white ticks over a red baseline
    step = 11
    for x in range(x0, x1, step):
        d.line([(x, y), (x, y + 22)], fill=WHITE, width=3)
    d.line([(x0, y + 26), (x1, y + 26)], fill=RED, width=5)


def wrap_to_width(text, fnt, max_w, draw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_title(draw, text, max_w, max_lines):
    for size in (88, 80, 72, 64, 56, 50):
        fnt = font(size)
        lines = wrap_to_width(text, fnt, max_w, draw)
        if len(lines) <= max_lines:
            return fnt, lines, size
    fnt = font(50)
    return fnt, wrap_to_width(text, fnt, max_w, draw)[:max_lines], 50


def card(title, badge=None, subtitle="WITH PROFESSOR CATHERINE CRUMP"):
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)

    # eyebrow wordmark
    eb = font(30)
    d.text((MARGIN, 70), "CIVIL LIBERTIES IN 60 SECONDS", font=eb, fill=WHITE)
    draw_ruler(d, MARGIN, W - MARGIN, 118)

    # title block, vertically centred in the middle band
    fnt, lines, size = fit_title(d, title, W - 2 * MARGIN, 4)
    lh = int(size * 1.14)
    block_h = lh * len(lines)
    y = 205 + (330 - block_h) // 2
    for line in lines:
        d.text((MARGIN, y), line, font=fnt, fill=WHITE)
        y += lh

    # footer: red duration pill + subtitle
    fy = H - 118
    if badge:
        bf = font(30)
        tw = d.textlength(badge, font=bf)
        d.rounded_rectangle([MARGIN, fy, MARGIN + tw + 44, fy + 52], radius=26, fill=RED)
        d.text((MARGIN + 22, fy + 9), badge, font=bf, fill=WHITE)
        sx = MARGIN + tw + 44 + 24
    else:
        sx = MARGIN
    sf = font(28, "Semibold")
    d.text((sx, fy + 12), subtitle, font=sf, fill=MUTED)
    return im


def dur_label(s):
    if s is None:
        return None
    return f"▶ {s // 60}:{s % 60:02d}"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    data = json.load(open(os.path.join(ROOT, "data", "episodes.json"), encoding="utf-8"))
    eps = data.get("episodes", [])
    for ep in eps:
        img = card(ep["title"], badge=dur_label(ep.get("duration")))
        img.save(os.path.join(OUT_DIR, f"{ep['id']}.png"))
    # home card
    card("Your civil liberties, explained in 60 seconds.", badge=None).save(
        os.path.join(OUT_DIR, "home.png")
    )
    print(f"✓ Generated {len(eps)} episode share cards + home.png in assets/og/")


if __name__ == "__main__":
    main()
