# BFREEKY — links site

One-page link hub for **BFREEKY** (Miami Bass & Dubstep). Static HTML/CSS/JS, no build step,
no framework, hosted on `schrombus` behind the existing Traefik and published at
**https://bfreeky.lmcustoms.cc**.

```
site/                  what nginx serves
  index.html           markup + the auto-generated RELEASES block
  assets/style.css     all styling (black, hard edges, red accents, Y2K)
  assets/app.js        player UI
  assets/tile.png      tiled background grid (scripts/build-tile.py)
  assets/tile-red.png  red copy of the grid, used for the glitch flashes
  assets/logo.png      wordmark, trimmed; black plate removed by mix-blend-mode:screen
  assets/favicon.png    "B" mark
  assets/og.jpg        1200x630 social preview
  data/releases.json   machine-readable track list (written by the cron)
scripts/
  fetch-soundcloud.py  pulls the track list and rewrites the RELEASES block in index.html
  build-assets.py      derives logo.png / favicon.png / og.jpg from assets/source/
  build-tile.py        draws the tiled background grid
deploy/
  docker-compose.yml   nginx container + Traefik labels
  nginx/default.conf   server block (mounted as a directory: git replaces files by rename,
                       a file bind-mount would keep serving the old inode)
assets/source/         the original logo file
```

## How the release list stays current

`scripts/fetch-soundcloud.py` reads the public profile page, takes the `client_id` out of the
page's own hydration payload (so nothing to rotate), asks `api-v2` for the track list and
rewrites the block between `<!-- RELEASES:START -->` and `<!-- RELEASES:END -->` in
`site/index.html`, plus the track count and the sync timestamp. It also writes
`site/data/releases.json`.

Both files are written atomically and only when the fetch succeeded — a failed run leaves the
page untouched. Cron on the host:

```
*/30 * * * * /usr/bin/python3 /home/cobra/bfreeky/scripts/fetch-soundcloud.py >> /home/cobra/bfreeky/fetch.log 2>&1
```

## Player

`site/index.html` loads SoundCloud's `api.js`; `app.js` drives an invisible widget iframe and
draws its own transport (play/pause, prev/next, seek, level meter) so nothing white-and-generic
sits in the design. If `api.js` does not load, every release row is still a plain link to
SoundCloud and the deck says so.

## Editing

- **Links** live directly in `site/index.html` (`.rows` … one `<a class="row">` per link).
- **Styling**: `assets/style.css`, top of file has the palette (`--sig` is the lime accent).
- **Logo**: replace `assets/source/logo-original.png`, run `python3 scripts/build-assets.py`.
- No build, no dependencies: edit, commit, `git pull` on the host (or just edit the file in place
  under `/home/cobra/bfreeky/site/`).

## Deploy

```bash
ssh cobra@152.53.13.93
cd /home/cobra/bfreeky && git pull
cd deploy && docker compose up -d      # container: bfreeky_web
```

Traefik picks the container up through its Docker provider (network `proxy-manager_default`) and
issues the Let's Encrypt certificate from the `Host()` label.
