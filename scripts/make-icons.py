#!/usr/bin/env python3
"""从品牌 mark 生成扩展图标（16 / 32 / 48 / 128）。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "brand" / "mark.png"
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

if not SOURCE.exists():
    raise SystemExit(f"缺少品牌图标：{SOURCE}")

source = Image.open(SOURCE).convert("RGBA")
for size in (16, 32, 48, 128):
    source.resize((size, size), Image.Resampling.LANCZOS).save(OUT / f"icon{size}.png", optimize=True)
print("icons written to", OUT)
