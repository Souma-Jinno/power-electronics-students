#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""教員用ページのチェック欄どおりに、学生ページ（GitHub Pages）を公開し直す。

教員用ページのチェック欄を変えると、publish_state.json（PUBLISH_DIR）に保存される。
このスクリプトは launchd で5分おきに動き、前回公開したときから「公開されるもの」が変わっていれば

  1. git pull --ff-only
  2. PUBLISH=1 python3 generate.py と同じ公開版を一時フォルダで作る
  3. 公開版の index.html からたどれるファイルだけを git add（リンクの切れたものは外す＝git rm --cached）
  4. 何を公開した／非公開に戻したかを書いて commit、push
  5. python3 generate.py で確認用（全部入り）に戻す

をやる。変わっていなければ何もしない（push もしない）。

  python3 publish_from_checks.py             本番（launchd から）
  python3 publish_from_checks.py --dry-run   何が commit されるかを表示するだけ（作業ツリーも git も触らない）

「公開されるもの」＝チェックあり かつ 置いてあるもの（generate.published_items）。
先にチェックだけ入れておけば、PDF や演習を置いた次の回の実行で公開される。
ログ：admin/publish/publish.log　前回公開したもの：admin/publish/last_published.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import html.parser
import importlib.util
import json
import os
import pathlib
import posixpath
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

sys.dont_write_bytecode = True   # generate.py を import しても __pycache__ を作らない

ROOT = pathlib.Path(__file__).resolve().parent
PUBLISH_DIR = ROOT.parent / "power_electronics_oit_jinno" / "admin" / "publish"
STATE = PUBLISH_DIR / "publish_state.json"
LAST = PUBLISH_DIR / "last_published.json"
LOG = PUBLISH_DIR / "publish.log"
LOCK = PUBLISH_DIR / "publish.lock"

# 公開版の中身として git で管理するところ。ここにあって index.html からたどれないものは外す
# 2026-10-23 学生用トップに sim/（回路のシミュレーター）のリンクを足したので，sim/ も公開版の中身に入れた（入れないとリンク切れで公開が止まる）
# 2026-10-23 講義資料の表に LTspice の zip と説明ページ（ltspice/）を足したので，ltspice/ も入れた。
#   説明ページ ltspice/index.html は generate.py が ltspice/_page_src.html から作り、公開版ではチェックの入った回だけ残す
CONTENT = ("index.html", "lectures/", "exercises/", "solutions/", "ondemand/", "videos/", "sim/", "ltspice/")
# 公開版を作るのに要るもの（一時フォルダへ写す。videos は大きいのでリンクにする）
BUILD_INPUTS = ("generate.py", "_style.html", "_students_style.html", "lectures", "exercises", "solutions", "sim", "ltspice")

DRY = False


def log(msg: str) -> None:
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line)
    if not DRY:
        PUBLISH_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def git(*args: str, check: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} が失敗: {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout


def load_generate():
    spec = importlib.util.spec_from_file_location("pe_generate", ROOT / "generate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def label(gen, key: str) -> str:
    n, kind = key.split("_", 1)
    return f"第{int(n)}回 {gen.KIND_LABEL.get(kind, kind)}"


def blob_sha(path: pathlib.Path) -> str:
    h = hashlib.sha1()
    h.update(b"blob %d\0" % path.stat().st_size)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Links(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs: list[str] = []

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if k in ("href", "src") and v:
                self.refs.append(v)


def crawl(site: pathlib.Path) -> set[str]:
    """公開版の index.html から、サイトの中へのリンク（href/src）をたどって集める。リンク切れは止める。"""
    seen: set[str] = set()
    todo = ["index.html"]
    missing = []
    while todo:
        rel = todo.pop()
        if rel in seen:
            continue
        seen.add(rel)
        if not rel.endswith(".html"):
            continue
        p = Links()
        p.feed((site / rel).read_text(encoding="utf-8"))
        base = posixpath.dirname(rel)
        for ref in p.refs:
            u = urllib.parse.urlsplit(ref)
            if u.scheme or u.netloc or ref.startswith(("#", "/", "mailto:", "javascript:")):
                continue
            path = urllib.parse.unquote(u.path)
            if not path:
                continue
            t = posixpath.normpath(posixpath.join(base, path))
            if t.startswith(".."):
                continue
            if not (site / t).exists():
                missing.append(f"{rel} → {t}")
                continue
            todo.append(t)
    if missing:
        raise RuntimeError("公開版にリンク切れがある: " + "; ".join(missing))
    return seen


def build_public(tmp: pathlib.Path, state: pathlib.Path) -> set[str]:
    """一時フォルダに公開版（PUBLISH=1）を作り、公開するファイルの一覧を返す。"""
    for name in BUILD_INPUTS:
        src = ROOT / name
        if src.is_dir():
            shutil.copytree(src, tmp / name)
        elif src.exists():
            shutil.copy2(src, tmp / name)
    (tmp / "videos").symlink_to(ROOT / "videos")
    env = dict(os.environ, PUBLISH="1", PUBLISH_STATE=str(state))
    r = subprocess.run([sys.executable, str(tmp / "generate.py")], cwd=tmp, env=env,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"PUBLISH=1 generate.py が失敗: {r.stderr.strip() or r.stdout.strip()}")
    return crawl(tmp)


def src_of(tmp: pathlib.Path, rel: str) -> pathlib.Path:
    # 動画は一時フォルダではリンクなので、実物を見る
    return ROOT / rel if rel.startswith("videos/") else tmp / rel


def is_source(rel: str) -> bool:
    name = posixpath.basename(rel)
    return rel.endswith(".py") or name.startswith("_")


def plan(tmp: pathlib.Path, files: set[str]) -> tuple[list[str], list[str], list[str]]:
    """HEAD と比べて (追加, 変更, 削除) のファイル。"""
    head = {}
    for line in git("ls-tree", "-r", "-z", "HEAD").split("\0"):
        if line:
            meta, path = line.split("\t", 1)
            head[path] = meta.split()[2]
    added, changed = [], []
    for rel in sorted(files):
        sha = blob_sha(src_of(tmp, rel))
        if rel not in head:
            added.append(rel)
        elif head[rel] != sha:
            changed.append(rel)
    # 2026-10-23 公開版の中身の下にある「ソース」（図の生成スクリプト *.py，ページの元 _*.html）は
    #   index.html からたどれなくても外さない（外すと git から消えて他の端末で作り直せなくなる）
    removed = sorted(p for p in head if p.startswith(CONTENT) and p not in files and not is_source(p))
    return added, changed, removed


def read_last() -> set[str] | None:
    try:
        return set(json.loads(LAST.read_text(encoding="utf-8"))["items"])
    except FileNotFoundError:
        return None


def write_last(items: set[str], commit: str) -> None:
    LAST.write_text(json.dumps({
        "items": sorted(items), "commit": commit,
        "at": dt.datetime.now().isoformat(timespec="seconds"),
    }, ensure_ascii=False, indent=1), encoding="utf-8")


def exclude(paths: list[str]) -> None:
    """外したファイル（手元には残す）が untracked で出てこないように .git/info/exclude に足す。"""
    ex = ROOT / ".git" / "info" / "exclude"
    have = set(ex.read_text(encoding="utf-8").splitlines()) if ex.exists() else set()
    new = [p for p in paths if p not in have]
    if new:
        with open(ex, "a", encoding="utf-8") as f:
            f.write("".join(p + "\n" for p in new))


def run() -> int:
    gen = load_generate()
    checked = gen.load_checked() if STATE.exists() else None
    if checked is None:
        log(f"状態ファイルが無いので何もしない: {STATE}")
        return 1
    now = gen.published_items(checked)
    last = read_last()
    plus = sorted(now - (last or set()))
    minus = sorted((last or set()) - now)

    if DRY:
        print("前回公開したもの:", ", ".join(sorted(last)) if last is not None else "（記録なし）")
        print("チェックどおりなら公開されるもの:", ", ".join(sorted(now)))
        print("新しく公開:", ", ".join(label(gen, k) for k in plus) or "なし")
        print("非公開に戻す:", ", ".join(label(gen, k) for k in minus) or "なし")
    elif last == now:
        return 0   # チェックは前回のまま。何もしない（5分おきに呼ばれるので、ログも書かない）

    if not DRY:
        log("チェックが変わった：公開 [" + ", ".join(plus) + "] 非公開 [" + ", ".join(minus) + "]")
        if git("rev-parse", "--abbrev-ref", "HEAD").strip() != "main":
            raise RuntimeError("main ブランチにいない")
        if git("diff", "--cached", "--name-only").strip():
            raise RuntimeError("index に別の変更が stage されている（手で作業中？）。今回は見送る")
        git("pull", "--ff-only", "--quiet")
        gen = load_generate()   # pull で generate.py が変わっていてもよいように読み直す
        now = gen.published_items(checked)

    with tempfile.TemporaryDirectory(prefix="pe_publish_") as td:
        tmp = pathlib.Path(td)
        files = build_public(tmp, STATE)
        added, changed, removed = plan(tmp, files)

        if DRY:
            print(f"公開版のファイル数: {len(files)}")
            print("HEAD との差分（commit されるもの）:")
            for tag, lst in (("追加", added), ("変更", changed), ("削除", removed)):
                for p in lst:
                    print(f"  {tag}: {p}")
            if not (added or changed or removed):
                print("  なし（いま GitHub Pages に出ている中身と同じ）")
            return 0

        if added or changed or removed:
            for rel in added + changed:
                if not rel.startswith("videos/"):
                    dst = ROOT / rel
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(tmp / rel, dst)
            if added or changed:
                git("add", "-f", "--", *(added + changed))
            if removed:
                git("rm", "--cached", "--quiet", "--", *removed)
                exclude(removed)
            lines = ["教員用ページのチェック欄から公開を更新", ""]
            if plus:
                lines.append("公開：" + "、".join(label(gen, k) for k in plus))
            if minus:
                lines.append("非公開に戻す：" + "、".join(label(gen, k) for k in minus))
            lines += ["", "ファイル（publish_from_checks.py が PUBLISH=1 で作った公開版）："]
            lines += [f"  {t} {p}" for t, lst in (("+", added), ("~", changed), ("-", removed)) for p in lst]
            git("commit", "--quiet", "-m", "\n".join(lines))
            log(f"commit {git('rev-parse', '--short', 'HEAD').strip()}：追加{len(added)} 変更{len(changed)} 削除{len(removed)}")
        else:
            log("公開版の中身は HEAD と同じ（commit なし）")

    # まだ push していない commit があれば push（前回 push に失敗した分もここで出る）
    if git("rev-list", "--count", "@{u}..HEAD").strip() != "0":
        git("push", "--quiet", "origin", "main")
        log("push した")
    write_last(now, git("rev-parse", "--short", "HEAD").strip())
    return 0


def main() -> int:
    global DRY
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="何が commit されるかを表示するだけ")
    DRY = ap.parse_args().dry_run
    if DRY:
        return run()

    PUBLISH_DIR.mkdir(parents=True, exist_ok=True)
    lock = open(LOCK, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 0   # 前の回がまだ動いている
    rc = 0
    worked = False
    try:
        before = LAST.read_text(encoding="utf-8") if LAST.exists() else None
        rc = run()
        worked = (LAST.read_text(encoding="utf-8") if LAST.exists() else None) != before
    except (Exception, SystemExit) as e:   # noqa: BLE001（generate.py の SystemExit も拾ってログに残す）
        log(f"失敗: {e}")
        worked = True
        rc = 1
    finally:
        if worked:
            # 確認用（全部入り）に戻す。手元の確認用ページが公開版のままにならないように
            r = subprocess.run([sys.executable, "generate.py"], cwd=ROOT, capture_output=True, text=True)
            log("確認用に戻した" if r.returncode == 0 else f"確認用の作り直しに失敗: {r.stderr.strip()}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
