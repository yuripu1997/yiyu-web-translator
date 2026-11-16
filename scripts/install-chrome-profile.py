#!/usr/bin/env python3
"""
把译屿（未打包扩展）注册进本机 Chrome 的某个用户配置（macOS）。

Chrome 把扩展元数据保存在 `Secure Preferences`，并对每个条目做 HMAC-SHA256
签名。直接用「加载已解压的扩展程序」需要人工点选目录；本脚本在 Chrome 退出后
写入扩展条目并重算签名，适合开发机重复安装/更新。

用法：
  python3 scripts/install-chrome-profile.py --profile "$HOME/Library/Application Support/Google/Chrome/Default"
  python3 scripts/install-chrome-profile.py --profile ... --dry-run

注意：写之前请先完全退出 Chrome；脚本会自动备份 Preferences 和 Secure Preferences。
"""
import argparse
import hashlib
import hmac
import json
import os
import shutil
import subprocess
import sys
import time

SEED = bytes.fromhex(
    "e748f336d85ea5f9dcdf25d8f347a65b4cdf667600f02df6724a2af18a212d26"
    "b788a25086910cf3a90313696871f3dc05823730c91df8ba5c4fd9c884b505a8"
)


def remove_empty(value):
    if isinstance(value, list):
        out = []
        for item in value:
            cleaned = remove_empty(item)
            if cleaned is not None:
                out.append(cleaned)
        return out or None
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            cleaned = remove_empty(item)
            if cleaned is not None:
                out[key] = cleaned
        return out or None
    return value


def chrome_json(value):
    if value is None:
        return b"null"
    if isinstance(value, bool):
        return b"true" if value else b"false"
    if isinstance(value, int):
        return str(value).encode("utf-8")
    if isinstance(value, float):
        text = repr(value)
        if "." not in text and "e" not in text and "E" not in text:
            text += ".0"
        return text.encode("utf-8")
    if isinstance(value, str):
        out = bytearray(b'"')
        for char in value:
            escaped = {
                "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t",
                "\\": "\\\\", '"': '\\"', "<": "\\u003C", "\u2028": "\\u2028", "\u2029": "\\u2029",
            }.get(char)
            if escaped is not None:
                out += escaped.encode("ascii")
            elif ord(char) < 32:
                out += ("\\u00%02x" % ord(char)).encode("ascii")
            else:
                out += char.encode("utf-8")
        out += b'"'
        return bytes(out)
    if isinstance(value, list):
        return b"[" + b",".join(chrome_json(item) for item in value) + b"]"
    if isinstance(value, dict):
        return b"{" + b",".join(chrome_json(k) + b":" + chrome_json(v) for k, v in value.items()) + b"}"
    raise TypeError(type(value))


def value_as_string(value):
    if isinstance(value, dict):
        value = remove_empty(value) or {}
    return chrome_json(value)


def calc_mac(device_id, path, value):
    message = device_id.encode("utf-8") + path.encode("utf-8") + value_as_string(value)
    return hmac.new(SEED, message, hashlib.sha256).hexdigest().upper()


def get_device_id():
    output = subprocess.check_output(
        ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"], text=True
    )
    for line in output.splitlines():
        if "IOPlatformUUID" in line:
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("未找到 IOPlatformUUID")


def build_entry(manifest, dist_path):
    host_permissions = manifest.get("host_permissions", [])
    api_permissions = manifest.get("permissions", [])
    chrome_time = str(int((time.time() + 11644473600) * 1_000_000))
    return {
        "active_permissions": {
            "api": api_permissions,
            "explicit_host": host_permissions,
            "manifest_permissions": [],
            "scriptable_host": ["<all_urls>"],
        },
        "commands": {},
        "content_settings": [],
        "creation_flags": 38,
        "from_webstore": False,
        "granted_permissions": {
            "api": api_permissions,
            "explicit_host": host_permissions,
            "manifest_permissions": [],
            "scriptable_host": ["<all_urls>"],
        },
        "incognito_content_settings": [],
        "incognito_preferences": {},
        "location": 4,
        "newAllowFileAccess": True,
        "path": dist_path,
        "preferences": {},
        "regular_only_preferences": {},
        "service_worker_registration_info": {"version": manifest.get("version", "1.0")},
        "serviceworkerevents": [
            "commands.onCommand",
            "contextMenus.onClicked",
            "runtime.onInstalled",
            "runtime.onStartup",
            "tabs.onUpdated",
        ],
        "state": 1,
        "version": manifest.get("version", "1.0"),
        "was_installed_by_default": False,
        "was_installed_by_oem": False,
        "withholding_permissions": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True, help="Chrome 用户配置目录（含 Preferences / Secure Preferences）")
    parser.add_argument("--extension-id", default="ldpnkgonodifjdpgfkafdkhniiaffkip")
    parser.add_argument("--dist", default=os.path.join(os.path.dirname(__file__), "..", "dist"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-running-check", action="store_true", help="测试用：跳过 Chrome 运行检查")
    args = parser.parse_args()

    profile = os.path.expanduser(args.profile)
    dist_path = os.path.abspath(os.path.expanduser(args.dist))
    prefs_path = os.path.join(profile, "Preferences")
    secure_path = os.path.join(profile, "Secure Preferences")
    manifest_path = os.path.join(dist_path, "manifest.json")

    if not os.path.isfile(manifest_path):
        raise SystemExit(f"找不到构建产物：{manifest_path}，请先执行 npm run build")
    if not os.path.isfile(secure_path):
        raise SystemExit(f"找不到 Chrome Secure Preferences：{secure_path}")

    # 检查 Chrome 是否正在运行（避免它覆盖写入）
    running = subprocess.run(["pgrep", "-fl", "Google Chrome"], capture_output=True, text=True)
    chrome_main = [
        line for line in running.stdout.splitlines()
        if "/Contents/MacOS/Google Chrome" in line and "--type=" not in line and "Helper" not in line
    ]
    if chrome_main and not args.dry_run and not args.skip_running_check:
        raise SystemExit("Chrome 仍在运行，请先完全退出 Google Chrome 再执行。")

    manifest = json.load(open(manifest_path, encoding="utf-8"))
    entry = build_entry(manifest, dist_path)
    device_id = get_device_id()

    secure = json.load(open(secure_path, encoding="utf-8"))
    secure.setdefault("extensions", {}).setdefault("settings", {})[args.extension_id] = entry
    secure.setdefault("protection", {}).setdefault("macs", {}).setdefault("extensions", {}).setdefault("settings", {})[
        args.extension_id
    ] = calc_mac(device_id, f"extensions.settings.{args.extension_id}", entry)
    secure["protection"]["super_mac"] = calc_mac(device_id, "", secure["protection"]["macs"])

    prefs = json.load(open(prefs_path, encoding="utf-8")) if os.path.exists(prefs_path) else {}
    prefs.setdefault("extensions", {}).setdefault("settings", {})[args.extension_id] = entry

    if args.dry_run:
        print(json.dumps({"profile": profile, "extension_id": args.extension_id, "path": dist_path, "device_id": device_id}, ensure_ascii=False, indent=2))
        return

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup_dir = os.path.expanduser(f"~/.qingyi-backups/{stamp}")
    os.makedirs(backup_dir, exist_ok=True)
    for path in (prefs_path, secure_path):
        if os.path.exists(path):
            shutil.copy2(path, os.path.join(backup_dir, os.path.basename(path)))

    # 原子写入，避免 Chrome 启动时看到半截 JSON
    for path, data in ((prefs_path, prefs), (secure_path, secure)):
        tmp = path + ".qingyi.tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
    print(json.dumps({"ok": True, "profile": profile, "extension_id": args.extension_id, "backup": backup_dir}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
