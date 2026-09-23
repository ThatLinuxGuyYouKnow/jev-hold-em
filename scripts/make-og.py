"""Generate public/og-image.png (1200x630) — minimal: spade logo + Jev Hold'em."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG_TOP = (5, 8, 15)
BG_BOT = (13, 26, 45)
WHITE = (245, 247, 250)


def font(name, size):
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}.ttf", size)


img = Image.new("RGB", (W, H))
px = img.load()
for y in range(H):  # vertical gradient
    t = y / H
    col = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
    for x in range(W):
        px[x, y] = col
d = ImageDraw.Draw(img)

spade = Image.open("public/logo-light.png").convert("RGBA")
spade.thumbnail((200, 200), Image.LANCZOS)

f_title = font("DejaVuSans-Bold", 128)
title = "Jev Hold'em"
bb = d.textbbox((0, 0), title, font=f_title)
tw, th = bb[2] - bb[0], bb[3] - bb[1]

gap = 36
group_h = spade.height + gap + th
top = (H - group_h) // 2

img.paste(spade, ((W - spade.width) // 2, top), spade)
d.text(((W - tw) // 2, top + spade.height + gap), title, font=f_title, fill=WHITE)

img.save("public/og-image.png")
print("wrote public/og-image.png", img.size)
