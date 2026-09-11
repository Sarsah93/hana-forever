#!/usr/bin/env python3
"""Turn a folder of dog photos into the sprites this app renders.

    python tools/mascot-kit/build_sprites.py --input photos/

Two generation paths share one normalising + manifest step:

  api   OPENAI_API_KEY is set -> gpt-image-1.5 edits the references into each pose.
        Can invent poses the photos do not contain, and follows the exclusion list
        (harness, collar, hands). Costs money per image.

  local no key -> rembg cuts the background out of the closest matching photo.
        Free and offline after the first model download, but it can only reproduce
        poses that are already in the photos, and it keeps whatever the dog wore.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spritekit as kit  # noqa: E402

SPRITE_ROOT = kit.REPO_ROOT / "assets" / "sprites"
MANIFEST_PATH = kit.REPO_ROOT / "src" / "assets" / "sprites.generated.json"


def generate_via_api(pose: dict, config: kit.MascotConfig, refs: list[Path]) -> Image.Image:
    import io

    from openai import OpenAI

    client = OpenAI()
    prompt = kit.fill_prompt(pose["prompt"], config.appearance)
    handles = [open(p, "rb") for p in refs]
    try:
        result = client.images.edit(
            model="gpt-image-1.5",
            image=handles,
            prompt=prompt,
            background="transparent",
            output_format="png",
            quality="high",
            input_fidelity="high",
            size="1024x1024",
        )
    finally:
        for handle in handles:
            handle.close()

    import base64
    return Image.open(io.BytesIO(base64.b64decode(result.data[0].b64_json)))


def generate_via_local(pose: dict, source: Path) -> Image.Image:
    from rembg import remove

    with Image.open(source) as im:
        im = im.convert("RGB")
        im.thumbnail((1536, 1536), Image.LANCZOS)
        return remove(im)


def write_manifest(entries: list[dict]) -> None:
    import json

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps({"sprites": entries}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="사진 폴더에서 마스코트 스프라이트를 만듭니다.")
    parser.add_argument("--input", required=True, type=Path,
                        help="full-body-*.jpg 와 face-*.jpg 가 들어 있는 폴더")
    parser.add_argument("--path", choices=["auto", "api", "local"], default="auto",
                        help="생성 경로. auto는 OPENAI_API_KEY 유무로 고릅니다.")
    parser.add_argument("--only", action="append",
                        help="이 동작만 만듭니다. 여러 번 쓸 수 있습니다.")
    parser.add_argument("--check", action="store_true",
                        help="사진 검사만 하고 생성은 하지 않습니다.")
    args = parser.parse_args()

    try:
        config = kit.load_config()
        buckets = kit.collect_inputs(args.input)
        warnings = kit.validate_inputs(buckets)
    except kit.InputError as error:
        print(f"입력을 쓸 수 없습니다:\n{error}", file=sys.stderr)
        return 2

    for warning in warnings:
        print(f"참고: {warning}")
    print(f"검사 통과 — 전신 {len(buckets['full-body'])}장, 얼굴 {len(buckets['face'])}장"
          + (f", 포즈 지정 {len(buckets['pose'])}장" if buckets["pose"] else ""))
    if args.check:
        return 0

    use_api = args.path == "api" or (args.path == "auto" and os.environ.get("OPENAI_API_KEY"))
    if args.path == "api" and not os.environ.get("OPENAI_API_KEY"):
        print("--path api 를 골랐지만 OPENAI_API_KEY가 없습니다.", file=sys.stderr)
        return 2
    print(f"생성 경로: {'OpenAI API' if use_api else '로컬 배경 제거 (rembg)'}")

    poses = [p for p in kit.load_poses() if not args.only or p["action"] in args.only]
    if not poses:
        print(f"--only 로 고른 동작이 poses.json에 없습니다.", file=sys.stderr)
        return 2

    entries: list[dict] = []
    failures = 0
    for pose in poses:
        action, facing = pose["action"], pose["facing"]
        print(f"\n[{action}/{facing}] {pose['label']}")
        try:
            if use_api:
                refs = buckets["full-body"][:2] + buckets["face"][:1]
                raw = generate_via_api(pose, config, refs)
            else:
                source = kit.find_pose_photo(buckets, action, facing)
                if source is None:
                    source = buckets["full-body"][0]
                    print(f"  참고: pose-{action}-{facing}.jpg 가 없어 {source.name} 으로 대신합니다. "
                          f"이 포즈의 사진을 그 이름으로 넣으면 자세가 맞습니다.")
                else:
                    print(f"  원본: {source.name}")
                raw = generate_via_local(pose, source)
            sprite = kit.normalise(raw)
        except kit.InputError as error:
            print(f"  실패: {error}", file=sys.stderr)
            failures += 1
            continue
        except Exception as error:  # noqa: BLE001 - surface the real cause to the user
            print(f"  실패: {type(error).__name__}: {error}", file=sys.stderr)
            failures += 1
            continue

        out = SPRITE_ROOT / action / f"{facing}-v1.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(out)
        print(f"  저장: {out.relative_to(kit.REPO_ROOT)}")
        print(f"  결과: {kit.describe(sprite)}")

        entries.append({
            "action": action,
            "facing": facing,
            "src": f"/{action}/{facing}-v1.png",
            "frameCount": 1,
            "fps": 1,
            "anchor": {"x": 0.5, "y": round(kit.BASELINE_Y / kit.CANVAS, 4)},
        })

    if entries:
        write_manifest(entries)
        print(f"\n매니페스트 갱신: {MANIFEST_PATH.relative_to(kit.REPO_ROOT)} ({len(entries)}개)")

    if failures:
        print(f"\n{failures}개 동작이 실패했습니다.", file=sys.stderr)
        return 1

    print("\n완료. 이제 `npm run tauri build` 로 설치 파일을 만드세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
