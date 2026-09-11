"""Shared pieces: config loading, input validation, and the canvas normaliser.

The normaliser is what makes a swapped-in dog actually line up with the running app.
Generation (API or local cutout) only ever produces "a transparent dog somewhere in
a frame"; the renderer needs every pose on one canvas with one shared foot line.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = REPO_ROOT / "mascot.config.json"
POSES_PATH = Path(__file__).resolve().parent / "poses.json"

# Must match assets/sprites/README.md and the anchor in the generated manifest.
CANVAS = 1024
BASELINE_Y = 969       # where the paws sit on the canvas
SUBJECT_MAX_H = 900    # tallest a subject may be drawn, leaving headroom
ALPHA_FLOOR = 10       # below this, a pixel counts as background

MIN_INPUT_PX = 768     # shortest side a usable source photo needs
MIN_FULL_BODY = 2      # how many full-body photos the kit insists on
MIN_FACE = 1


class InputError(Exception):
    """Raised when the supplied photos cannot produce a usable mascot."""


@dataclass(frozen=True)
class Appearance:
    breed: str
    coat: str
    features: str
    exclude: str


@dataclass(frozen=True)
class MascotConfig:
    mascot_name: str
    app_name: str
    identifier: str
    appearance: Appearance


def load_config(path: Path = CONFIG_PATH) -> MascotConfig:
    raw = json.loads(path.read_text(encoding="utf-8"))
    look = raw.get("appearance", {})
    missing = [k for k in ("mascotName", "appName", "identifier") if not raw.get(k)]
    if missing:
        raise InputError(f"mascot.config.json에 {', '.join(missing)} 값이 비어 있습니다.")
    return MascotConfig(
        mascot_name=raw["mascotName"],
        app_name=raw["appName"],
        identifier=raw["identifier"],
        appearance=Appearance(
            breed=look.get("breed", "dog"),
            coat=look.get("coat", ""),
            features=look.get("features", ""),
            exclude=look.get("exclude", "no harness, no collar, no human hands"),
        ),
    )


def load_poses() -> list[dict]:
    return json.loads(POSES_PATH.read_text(encoding="utf-8"))["poses"]


def fill_prompt(prompt: str, look: Appearance) -> str:
    return (prompt
            .replace("{breed}", look.breed)
            .replace("{coat}", look.coat)
            .replace("{features}", look.features)
            .replace("{exclude}", look.exclude))


def collect_inputs(folder: Path) -> dict[str, list[Path]]:
    """Sort the supplied photos into roles by filename prefix.

    Filenames drive the roles so the kit stays usable by someone who will never
    read this file: `full-body-1.jpg`, `face-1.jpg`.
    """
    if not folder.is_dir():
        raise InputError(f"입력 폴더가 없습니다: {folder}")

    buckets: dict[str, list[Path]] = {"full-body": [], "face": [], "other": []}
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        name = path.name.lower()
        if name.startswith("full-body"):
            buckets["full-body"].append(path)
        elif name.startswith("face"):
            buckets["face"].append(path)
        elif name.startswith("pose-"):
            # pose-<action>-<facing>.jpg lets the local path reproduce a specific pose
            # instead of falling back to a generic full-body shot.
            buckets.setdefault("pose", []).append(path)
        else:
            buckets["other"].append(path)
    buckets.setdefault("pose", [])
    return buckets


def find_pose_photo(buckets: dict[str, list[Path]], action: str, facing: str) -> Path | None:
    wanted = f"pose-{action}-{facing}".lower()
    for path in buckets.get("pose", []):
        if path.stem.lower() == wanted:
            return path
    return None


def validate_inputs(buckets: dict[str, list[Path]]) -> list[str]:
    """Return human-readable warnings; raise InputError on anything fatal."""
    problems: list[str] = []
    warnings: list[str] = []

    if len(buckets["full-body"]) < MIN_FULL_BODY:
        problems.append(
            f"전신 사진이 {len(buckets['full-body'])}장입니다. "
            f"`full-body-1.jpg`처럼 이름 붙인 사진이 최소 {MIN_FULL_BODY}장 필요합니다."
        )
    if len(buckets["face"]) < MIN_FACE:
        problems.append(
            f"얼굴 사진이 {len(buckets['face'])}장입니다. "
            f"`face-1.jpg`처럼 이름 붙인 사진이 최소 {MIN_FACE}장 필요합니다."
        )

    for role in ("full-body", "face"):
        for path in buckets[role]:
            with Image.open(path) as im:
                if min(im.size) < MIN_INPUT_PX:
                    problems.append(
                        f"{path.name}: {im.size[0]}x{im.size[1]}. "
                        f"짧은 쪽이 {MIN_INPUT_PX}px 이상이어야 합니다."
                    )

    if buckets["other"]:
        warnings.append(
            "역할을 알 수 없어 무시한 파일: "
            + ", ".join(p.name for p in buckets["other"])
        )

    if problems:
        raise InputError("\n".join("- " + p for p in problems))
    return warnings


def normalise(image: Image.Image) -> Image.Image:
    """Trim to the subject, scale to the shared height budget, seat it on BASELINE_Y.

    Without this every pose lands at a different size and foot line, and the mascot
    jumps as it switches actions.
    """
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    if bbox is None:
        raise InputError("잘라낸 결과가 완전히 투명합니다. 원본 사진을 확인하세요.")

    subject = rgba.crop(bbox)
    width, height = subject.size

    scale = min(SUBJECT_MAX_H / height, (CANVAS * 0.92) / width, 1.0) if height else 1.0
    if scale != 1.0:
        subject = subject.resize((max(1, round(width * scale)), max(1, round(height * scale))),
                                 Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - subject.width) // 2
    y = BASELINE_Y - subject.height
    if y < 0:
        raise InputError("피사체가 캔버스보다 큽니다. SUBJECT_MAX_H를 줄이세요.")
    canvas.paste(subject, (x, y), subject)
    return canvas


def describe(image: Image.Image) -> str:
    alpha = image.convert("RGBA").getchannel("A")
    bbox = alpha.point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    pixels = list(alpha.getdata())
    opaque = sum(1 for v in pixels if v > ALPHA_FLOOR)
    return (f"{image.width}x{image.height}, 불투명 {opaque / len(pixels) * 100:.1f}%, "
            f"내용 y {bbox[1]}-{bbox[3]}, x {bbox[0]}-{bbox[2]}")
