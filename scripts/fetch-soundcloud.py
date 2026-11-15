#!/usr/bin/env python3
"""Pull bfreeky's SoundCloud profile + track list and render it into the static site.

No API key: the profile page ships the client_id in its hydration payload, so it is
re-read on every run and survives rotation. Run from cron on the web host (see README).

Writes:
  site/data/releases.json   machine-readable copy (for anything that wants it)
  site/index.html           the RELEASES / COUNT / SYNC blocks between the HTML markers

Every write is atomic (tmp + os.replace). On any failure the previous files are left
untouched and the exit code is non-zero, so nginx never serves a half-written page.
"""
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request

PROFILE = "https://soundcloud.com/bfreeky"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/130.0.0.0 Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "site", "index.html")
JSON_OUT = os.path.join(ROOT, "site", "data", "releases.json")
LIMIT = 24


def get(url, accept="text/html"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def hydration(page):
    m = re.search(r"window\.__sc_hydration\s*=\s*(\[.*?\]);", page, re.S)
    if not m:
        raise SystemExit("hydration payload not found - profile markup changed")
    return {x.get("hydratable"): x.get("data") for x in json.loads(m.group(1))}


def collect():
    page = get(PROFILE)
    hy = hydration(page)
    user = hy["user"]
    client_id = hy["apiClient"]["id"]
    uid = user["id"]

    tracks, offset = [], 0
    while len(tracks) < LIMIT and offset < 200:
        api = (f"https://api-v2.soundcloud.com/users/{uid}/tracks"
               f"?client_id={client_id}&limit=50&offset={offset}&linked_partitioning=1")
        chunk = json.loads(get(api, accept="application/json"))
        page_items = chunk.get("collection") or []
        for t in page_items:
            if not t.get("streamable") or t.get("policy") == "BLOCK":
                continue
            if not t.get("permalink_url"):
                continue
            tracks.append({
                "id": t["id"],
                "title": t.get("title") or "untitled",
                "url": t["permalink_url"],
                "date": (t.get("display_date") or t.get("created_at") or "")[:10],
                "created_at": t.get("created_at") or "",
                "genre": (t.get("genre") or "").strip(),
                "plays": t.get("playback_count") or 0,
                "likes": t.get("likes_count") or 0,
                "art": (t.get("artwork_url") or "").replace("-large", "-t300x300"),
                "duration_ms": t.get("duration") or 0,
            })
        if not page_items or not chunk.get("next_href"):
            break
        offset += len(page_items)

    if not tracks:
        raise SystemExit("no public tracks returned - refusing to overwrite the page")

    tracks.sort(key=lambda t: t["created_at"], reverse=True)
    tracks = tracks[:LIMIT]
    return user, tracks


def dur(ms):
    s = int(ms) // 1000
    return f"{s // 60:02d}:{s % 60:02d}"


def esc(s):
    return html.escape(str(s), quote=True)


def rows_block(tracks):
    out = []
    for i, t in enumerate(tracks, 1):
        if t["art"]:
            thumb = f' style="background-image:url(\'{esc(t["art"])}\')"'
            cls = "track__thumb"
        else:
            thumb = ""
            cls = "track__thumb track__thumb--ph"
        meta = " · ".join(x for x in (esc(t["genre"]).upper(), t["date"], dur(t["duration_ms"])) if x)
        if t["plays"]:
            meta += f' · {t["plays"]} PLAYS'
        out.append(
            f'        <a class="track" href="{esc(t["url"])}" target="_blank" rel="noopener"'
            f' data-id="{t["id"]}" data-title="{esc(t["title"])}"'
            f' data-url="{esc(t["url"])}" data-dur="{t["duration_ms"]}">\n'
            f'          <span class="track__i">{i:02d}</span>\n'
            f'          <span class="{cls}"{thumb}></span>\n'
            f'          <span class="track__body">\n'
            f'            <span class="track__title">{esc(t["title"])}</span>\n'
            f'            <span class="track__meta">{meta}</span>\n'
            f'          </span>\n'
            f'          <span class="track__cue" aria-hidden="true"></span>\n'
            f'        </a>')
    out.append('')  # trailing newline guard
    return "\n".join(out).rstrip("\n")


def patch(text, marker, value):
    pat = re.compile(rf"(<!-- {marker}:START -->).*?(<!-- {marker}:END -->)", re.S)
    if not pat.search(text):
        raise SystemExit(f"marker {marker} missing in index.html")
    return pat.sub(lambda m: m.group(1) + value + m.group(2), text, count=1)


def main():
    user, tracks = collect()
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    synced = now.strftime("%Y-%m-%d %H:%M UTC")
    payload = {
        "artist": user.get("full_name") or user.get("username"),
        "profile": profile_url(user),
        "followers": user.get("followers_count"),
        "synced": now.isoformat(timespec="seconds"),
        "tracks": tracks,
    }

    index = open(INDEX, encoding="utf-8").read()
    index = patch(index, "RELEASES", "\n" + rows_block(tracks) + "\n      ")
    index = patch(index, "COUNT", str(len(tracks)))
    index = patch(index, "SYNC", f"SYNCED {synced}")

    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    for path, data in ((JSON_OUT, json.dumps(payload, indent=2, ensure_ascii=False) + "\n"),
                       (INDEX, index)):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(data)
        os.replace(tmp, path)

    print(f"ok: {len(tracks)} tracks, synced {synced}")


def profile_url(user):
    return user.get("permalink_url") or PROFILE


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        sys.exit(f"http error {e.code} on {e.url}")
    except urllib.error.URLError as e:
        sys.exit(f"network error: {e.reason}")
