# og-image generator — anchored v3. Pixel-anchor brand carried over, message updated:
# the verification gate. 1280x640, deterministic.
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 640
img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)

# ── background: vertical navy→deep-teal gradient (like the old one) ──────────
top, bottom = (10, 25, 33), (4, 14, 22)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))

# sparse pixel stars
import random
rng = random.Random(7)
for _ in range(46):
    x, y = rng.randint(10, W - 10), rng.randint(10, H - 10)
    s = rng.choice([3, 4, 5, 6])
    shade = rng.choice([(35, 90, 95), (45, 110, 115), (60, 140, 140)])
    d.rectangle([x, y, x + s, y + s], fill=shade)

# ── pixel block painter with bevel (teal like the old anchor) ────────────────
TEAL = (45, 212, 191)
TEAL_HI = (125, 240, 222)
TEAL_LO = (23, 140, 126)


def block(cx, cy, cell, color=TEAL, hi=TEAL_HI, lo=TEAL_LO):
    x0, y0 = cx, cy
    x1, y1 = cx + cell - 2, cy + cell - 2
    d.rectangle([x0, y0, x1, y1], fill=color)
    b = max(3, cell // 8)
    d.rectangle([x0, y0, x1, y0 + b], fill=hi)          # top bevel
    d.rectangle([x0, y0, x0 + b, y1], fill=hi)          # left bevel
    d.rectangle([x0, y1 - b, x1, y1], fill=lo)          # bottom shade
    d.rectangle([x1 - b, y0 + b, x1, y1], fill=lo)      # right shade


# ── the anchor, on a block grid (14 cols × 15 rows) ──────────────────────────
ANCHOR = [
    "    XXXX    ",
    "   XX  XX   ",
    "   X    X   ",
    "   XX  XX   ",
    "    XXXX    ",
    "     XX     ",
    "  XXXXXXXX  ",
    "     XX     ",
    "     XX     ",
    " X   XX   X ",
    " X   XX   X ",
    " XX  XX  XX ",
    "  XX XX XX  ",
    "   XXXXXX   ",
    "     XX     ",
]
CELL = 30
AX, AY = 96, 110
for r, row in enumerate(ANCHOR):
    for c, ch in enumerate(row):
        if ch == "X":
            block(AX + c * CELL, AY + r * CELL, CELL)

# soft ellipse shadow under the anchor
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sh).ellipse([AX + 20, AY + 15.2 * CELL + 6, AX + 12 * CELL + 10, AY + 15.6 * CELL + 40], fill=(0, 0, 0, 90))
img = Image.alpha_composite(img.convert("RGBA"), sh).convert("RGB")
d = ImageDraw.Draw(img)

# ── typography (Menlo) ───────────────────────────────────────────────────────
def font(size, bold=True):
    return ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", size, index=1 if bold else 0)


TX = 520
WHITE = (238, 244, 246)
GRAY = (140, 158, 168)
AMBER = (250, 204, 90)

# wordmark with drop shadow
f_word = font(92)
d.text((TX + 5, 105), "anchored", font=f_word, fill=(16, 90, 84))
d.text((TX, 100), "anchored", font=f_word, fill=TEAL)

# headline — THE invariant
f_head = font(52)
d.text((TX, 250), "Nothing reaches done", font=f_head, fill=WHITE)
d.text((TX, 318), "without evidence.", font=f_head, fill=TEAL)

# subline
f_sub = font(24, bold=False)
d.text((TX, 400), "You work like always. An independent", font=f_sub, fill=GRAY)
d.text((TX, 434), "validator proves every criterion.", font=f_sub, fill=GRAY)

# ── v3 motif: an evidence-gated criteria list (replaces the 4 stage blocks) ──
CY = 502
CB = 34  # checkbox cell
f_label = font(22)


def checkbox(x, y, state):
    # box
    box_col = (16, 60, 66)
    d.rectangle([x, y, x + CB, y + CB], fill=box_col)
    d.rectangle([x, y, x + CB, y + 3], fill=(30, 90, 96))
    d.rectangle([x, y, x + 3, y + CB], fill=(30, 90, 96))
    if state == "done":
        # pixel check
        for i, (dx, dy) in enumerate([(6, 16), (10, 20), (14, 24), (18, 18), (22, 12), (26, 6)]):
            d.rectangle([x + dx, y + dy, x + dx + 5, y + dy + 5], fill=TEAL)
    elif state == "failed":
        for dx, dy in [(7, 7), (13, 13), (19, 19), (7, 19), (19, 7), (13, 13)]:
            d.rectangle([x + dx, y + dy, x + dx + 7, y + dy + 7], fill=AMBER)


rows = [
    ("done", "c1  proven", TEAL),
    ("done", "c2  proven", TEAL),
    ("failed", "c3  fix-list", AMBER),
]
x = TX
for state, label, col in rows:
    checkbox(x, CY, state)
    d.text((x + CB + 12, CY + 5), label, font=f_label, fill=col)
    x += CB + 12 + int(d.textlength(label, font=f_label)) + 36

# footer
f_foot = font(24)
tag = "// Claude Code plugin"
d.text((W - d.textlength(tag, font=f_foot) - 40, 585), tag, font=f_foot, fill=TEAL)

out = "/Users/jack/Dev/anchored-v3/assets/og-image-new.png"
img.save(out)
print("saved", out)
