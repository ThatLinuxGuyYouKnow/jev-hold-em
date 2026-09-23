"""Generate public/og-image.png (1200x630) for Jev Hold'em LinkedIn sharing."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG_TOP = (5, 8, 15)
BG_BOT = (13, 26, 45)
ACCENT = (45, 212, 191)      # teal
GOLD = (232, 197, 132)
WHITE = (245, 247, 250)
MUTED = (148, 163, 184)
BAR_BG = (30, 41, 59)
RED = (248, 113, 113)

def font(name, size):
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}.ttf", size)

f_title = font("DejaVuSans-Bold", 96)
f_sub = font("DejaVuSans", 34)
f_small = font("DejaVuSans-Bold", 24)
f_bar = font("DejaVuSans-Bold", 24)
f_suit = font("DejaVuSans", 130)

img = Image.new("RGB", (W, H))
px = img.load()
for y in range(H):  # vertical gradient
    t = y / H
    px_col = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
    for x in range(W):
        px[x, y] = px_col
d = ImageDraw.Draw(img, "RGBA")

# faint giant suits in background (solid dark tones — alpha is ignored on RGB)
d.text((900, 360), "\u2660", font=f_suit, fill=(22, 34, 52))
d.text((60, 460), "\u2665", font=f_suit, fill=(52, 28, 34))

# felt ellipse glow
d.ellipse((580, -220, 1380, 620), fill=(16, 60, 48, 255))
d.ellipse((620, -160, 1340, 560), fill=(10, 40, 34, 255))

# spade logo
try:
    spade = Image.open("public/logo-light.png").convert("RGBA")
    spade.thumbnail((150, 150), Image.LANCZOS)
    img.paste(spade, (80, 64), spade)
except Exception as e:
    print("logo skip:", e)
    d.text((80, 40), "\u2660", font=font("DejaVuSans", 150), fill=(255, 255, 255, 255))

# text block
d.text((260, 70), "Jev Hold'em", font=f_title, fill=WHITE)
d.text((262, 180), "Bluff the machine. You vs the type-safe bot.", font=f_sub, fill=MUTED)

# pills (must fit in 1200 - 262 = 938px)
pills = ["4 parallel decisions", "probabilities, not prose", "confidence-gated"]
x = 262
for p in pills:
    bb = d.textbbox((0, 0), p, font=f_small)
    pw = bb[2] - bb[0] + 30
    d.rounded_rectangle((x, 244, x + pw, 284), 20, outline=ACCENT, width=2)
    d.text((x + 15, 249), p, font=f_small, fill=ACCENT)
    x += pw + 12

# mock decision bars (the LinkedIn money shot)
bars = [("call", 0.48, WHITE), ("raise", 0.34, GOLD), ("fold", 0.18, RED)]
by = 336
d.text((262, by - 38), "jev: call  p=0.48  conf=0.23  ->  pot-control", font=f_small, fill=MUTED)
for label, p, col in bars:
    d.text((262, by + 6), label, font=f_bar, fill=MUTED)
    d.rounded_rectangle((380, by, 940, by + 34), 17, fill=BAR_BG)
    d.rounded_rectangle((380, by, 380 + int(560 * p), by + 34), 17, fill=col)
    d.text((955, by + 4), f"{int(p * 100)}%", font=f_bar, fill=WHITE)
    by += 50

# confidence meter (low = the story)
d.text((262, by + 6), "confidence", font=f_bar, fill=MUTED)
d.rounded_rectangle((380, by + 42, 940, by + 56), 7, fill=BAR_BG)
d.rounded_rectangle((380, by + 42, 380 + int(560 * 0.23), by + 56), 7, fill=RED)
d.text((955, by + 32), "23%", font=f_bar, fill=RED)

d.text((262, 584), "typesafe-ai/jev  •  70-500ms  •  $0.042 / 1M tokens", font=f_small, fill=(100, 116, 139))

img.save("public/og-image.png")
print("wrote public/og-image.png", img.size)
