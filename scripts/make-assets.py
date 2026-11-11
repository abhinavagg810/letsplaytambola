#!/usr/bin/env python3
"""Regenerates store/web artwork from the designer's files in docs/design_handoff/assets.
   python3 scripts/make-assets.py      (needs Pillow)
Outputs: assets/icon.png, adaptive-icon.png, splash-icon.png, favicon.png, public/og.png, public/icon-192.png, icon-512.png,
public/apple-touch-icon.png"""
import os
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
p = lambda *a: os.path.join(ROOT, *a)
src = Image.open(p('docs/design_handoff/assets/app-icon-1024.png')).convert('RGBA')
N = src.width
PLUM = src.getpixel((N // 2, 8))[:3]          # sampled from the artwork's background

# 1. Full-bleed square icon: the artwork over a solid plum square (stores round the corners themselves).
icon = Image.new('RGBA', (N, N), PLUM + (255,))
icon.alpha_composite(src)
icon = icon.convert('RGB')
icon.save(p('assets/icon.png'))

# 2. The ball alone: find its bounding box (pixels that differ from plum), cut it out with an anti-aliased circle.
diff = ImageChops.difference(icon, Image.new('RGB', (N, N), PLUM)).convert('L').point(lambda v: 255 if v > 24 else 0)
l, t, r, b = diff.getbbox()
cx, cy, rad = (l + r) / 2, (t + b) / 2, max(r - l, b - t) / 2
SS = 4
mask = Image.new('L', (N * SS, N * SS), 0)
ImageDraw.Draw(mask).ellipse([(cx - rad) * SS, (cy - rad) * SS, (cx + rad) * SS, (cy + rad) * SS], fill=255)
mask = mask.resize((N, N), Image.LANCZOS)
ball = icon.convert('RGBA'); ball.putalpha(mask)
ball = ball.crop((int(cx - rad), int(cy - rad), int(cx + rad + 1), int(cy + rad + 1)))

def on_canvas(size, diameter, bg=(0, 0, 0, 0)):
    c = Image.new('RGBA', (size, size), bg)
    bl = ball.resize((diameter, diameter), Image.LANCZOS)
    c.alpha_composite(bl, ((size - diameter) // 2, (size - diameter) // 2))
    return c

# Android adaptive foreground: launchers may crop to the central 66% circle -> ball at 58% of the canvas.
on_canvas(1024, 594).save(p('assets/adaptive-icon.png'))
# Splash: ball only, small transparent margin.
on_canvas(1024, 920).save(p('assets/splash-icon.png'))
# Favicon and PWA icons (full-bleed plum squares).
icon.resize((64, 64), Image.LANCZOS).save(p('assets/favicon.png'))
for s, name in ((192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')):
    icon.resize((s, s), Image.LANCZOS).save(p('public', name))
# Maskable PWA icon: ball inside the 80% safe zone.
on_canvas(512, 330, PLUM + (255,)).convert('RGB').save(p('public/icon-maskable-512.png'))

# 3. Link-preview image 1200x630: the wordmark on plum, centred.
logo = Image.open(p('docs/design_handoff/assets/logo-on-plum-4x.png')).convert('RGB')
w = 1000; h = round(logo.height * w / logo.width)
og = Image.new('RGB', (1200, 630), logo.getpixel((0, 0)))
og.paste(logo.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, (630 - h) // 2))
og.save(p('public/og.png'), optimize=True)
print('plum', '#%02X%02X%02X' % PLUM, 'ball bbox', (l, t, r, b))
