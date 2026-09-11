#!/usr/bin/env python3
"""Push mascot.config.json into the files Tauri reads at build time.

tauri.conf.json cannot reference another file, so the app name and bundle
identifier have to be copied in. Run this after editing mascot.config.json and
before `npm run tauri build`.
"""
from __future__ import annotations

import json
import sys
from collections import OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spritekit as kit  # noqa: E402

TAURI_CONF = kit.REPO_ROOT / "src-tauri" / "tauri.conf.json"


def main() -> int:
    try:
        config = kit.load_config()
    except kit.InputError as error:
        print(f"설정을 읽을 수 없습니다: {error}", file=sys.stderr)
        return 2

    raw = json.loads(TAURI_CONF.read_text(encoding="utf-8"), object_pairs_hook=OrderedDict)
    changes: list[str] = []

    for key, value in (("productName", config.app_name), ("identifier", config.identifier)):
        if raw.get(key) != value:
            changes.append(f"  {key}: {raw.get(key)!r} -> {value!r}")
            raw[key] = value

    window = raw["app"]["windows"][0]
    if window.get("title") != config.app_name:
        changes.append(f"  창 제목: {window.get('title')!r} -> {config.app_name!r}")
        window["title"] = config.app_name

    if not changes:
        print("tauri.conf.json 은 이미 설정과 일치합니다.")
        return 0

    TAURI_CONF.write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("tauri.conf.json 갱신:")
    print("\n".join(changes))
    print("\n창 제목·트레이 메뉴·드래그 손잡이는 mascot.config.json 을 직접 읽으므로 따로 손댈 것이 없습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
