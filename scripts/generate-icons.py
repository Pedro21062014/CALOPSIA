#!/usr/bin/env python3
"""Gera ícones dos instaladores a partir do logo oficial do CALOPSIA.

Requer Pillow: python3 -m pip install Pillow
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "logo-official-source.png"
CANVAS_SIZE = 1024
MAX_ART_SIZE = 896


def render_master() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("O logo oficial não contém pixels visíveis")

    artwork = source.crop(bbox)
    scale = min(MAX_ART_SIZE / artwork.width, MAX_ART_SIZE / artwork.height)
    size = (round(artwork.width * scale), round(artwork.height * scale))
    artwork = artwork.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    position = ((CANVAS_SIZE - size[0]) // 2, (CANVAS_SIZE - size[1]) // 2)
    canvas.alpha_composite(artwork, position)
    return canvas


def main() -> None:
    master = render_master()
    master.save(ASSETS / "icon.png", optimize=True)
    master.save(
        ASSETS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    master.save(
        ASSETS / "icon.icns",
        format="ICNS",
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)],
    )
    print("Ícones oficiais do CALOPSIA gerados com sucesso.")


if __name__ == "__main__":
    main()
