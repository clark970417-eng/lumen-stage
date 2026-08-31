#!/usr/bin/env python3
"""Render the six localized 15-second website demos from fixed capture frames."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / "tmp" / "media-capture"
OUTPUT = ROOT / "public" / "site-demo"
CONFIGS = ROOT / "tmp" / "media-video-configs"
RENDERER = Path(os.environ.get(
    "LUMEN_BROWSER_VIDEO_RENDERER",
    Path.home() / ".codex" / "skills" / "browser-video-recording" / "scripts" / "render_browser_demo.py",
))
LOCALES = ("en", "zh", "ja")


def cursor_asset() -> Path:
    target = CONFIGS / "cursor.png"
    image = Image.new("RGBA", (40, 52), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    points = [(3, 2), (3, 41), (13, 31), (20, 49), (29, 45), (21, 28), (36, 28)]
    draw.polygon(points, fill=(247, 250, 252, 255), outline=(7, 14, 20, 255), width=2)
    image.save(target)
    return target


def render(locale: str, mode: str, cursor: Path) -> None:
    is_full = mode == "full"
    output_size = [3840, 2880] if is_full else [1440, 1080]
    suffix = "" if is_full else "-mobile"
    shots = {
        f"shot{index}": str(CAPTURES / locale / f"video-{mode}-{index}.png")
        for index in range(6)
    }
    config = {
        "duration": 15,
        "fps": 60,
        "output_size": output_size,
        "source_size": [1920, 1440],
        "cursor_asset": str(cursor),
        "cursor_hotspot": [3, 3],
        "cursor_scale": 1.45 if is_full else 0.9,
        "click_strength": 14,
        "rotation_strength_degrees": 5,
        "shots": shots,
        "scene_starts": [[index * 2.5, f"shot{index}", "fade"] for index in range(6)],
        "cursor_keys": [
            [0.0, 280, 230], [2.25, 1450, 1120],
            [2.5, 1040, 130], [4.75, 1250, 660],
            [5.0, 1180, 130], [7.25, 1340, 760],
            [7.5, 1320, 130], [9.75, 1040, 710],
            [10.0, 1510, 130], [12.25, 1120, 1050],
            [12.5, 1660, 150], [14.9, 1540, 1160],
        ],
        "camera_keys": [[0.0, 960, 720, 1.0], [15.0, 960, 720, 1.0]],
        "click_times": [2.3, 4.8, 7.3, 9.8, 12.3],
        "preset": "veryfast",
        "crf": 17,
    }
    config_path = CONFIGS / f"{locale}-{mode}.json"
    config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    target = OUTPUT / f"{locale}{suffix}.mp4"
    env = os.environ.copy()
    ffmpeg = os.environ.get("LUMEN_FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg was not found; set LUMEN_FFMPEG_BIN to its executable path")
    env["PATH"] = f"{Path(ffmpeg).parent}:{env.get('PATH', '')}"
    if not RENDERER.is_file():
        raise RuntimeError("browser-video-recording renderer was not found; set LUMEN_BROWSER_VIDEO_RENDERER")
    subprocess.run(
        [sys.executable, str(RENDERER), "--config", str(config_path), "--output", str(target)],
        check=True,
        env=env,
    )


def main() -> None:
    CONFIGS.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cursor = cursor_asset()
    for locale in LOCALES:
        render(locale, "full", cursor)
        render(locale, "simple", cursor)
        poster = Image.open(CAPTURES / locale / "video-full-1.png").convert("RGB")
        poster.save(OUTPUT / f"{locale}.jpg", quality=95, subsampling=0, optimize=True)


if __name__ == "__main__":
    main()
