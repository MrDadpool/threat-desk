# Threat Desk

A self-hosted news desk for security, sysadmin, platform and AI signal. 93 RSS/Atom
sources across six domains, polled on a schedule, rendered as one page: a coverage
summary up top (arrival volume, CVE IDs seen, source health, attack origins) and a
merged river of headlines underneath.

Every figure on the page is counted from the snapshot. Nothing is estimated.

## How it works

```
td-refresh  ──polls 93 feeds──▶  data/snapshot.json  ──▶  threat-desk.html
   (GitHub Actions, every 30 min)                            (static page, no build step)
```

- `threat-desk.html` — the whole reader. No framework, no bundler, no dependencies.
  Fetches `data/snapshot.json` on load.
- `td-refresh` — Python 3 stdlib only. Reads the feed registry out of the page, polls
  every source in 16 threads, dedupes by title, drops items older than 14 days, records
  per-source latency and reachability.
- `.github/workflows/poll.yml` — runs the poll on a cron and force-pushes a
  single-commit `deploy` branch, so the 1 MB snapshot never accumulates in git history.

## Run it locally

```bash
./td-refresh                    # writes data/snapshot.json
python3 -m http.server 8000     # then open http://localhost:8000/threat-desk.html
```

For a single file that works offline, with no server:

```bash
./td-refresh --embed --open      # writes threat-desk.local.html
```

A `file://` page can't fetch a sibling JSON, which is why the offline build bakes the
snapshot in.

## Add or remove a source

Edit the `FEEDS` object at the top of the `<script>` in `threat-desk.html`, then re-run
`./td-refresh`. One line per feed:

```js
{n:"Krebs on Security", u:"https://krebsonsecurity.com/feed/"},
```

The Sources dialog in the page shows every feed's last result, item count, and fetch
latency, and lets you disable one without editing anything.

## Attack origins

The deck carries a world map of attack **source countries**, bubble area proportional to
report volume, from the [SANS Internet Storm Center](https://isc.sans.edu/) DShield sensor
network — free, no API key. Beside it: the ports being hit, by record count.

Unlike the RSS feeds, `isc.sans.edu/api` sends `Access-Control-Allow-Origin: *`, so the
page fetches this itself on load. The map fills with no snapshot, no `td-refresh`, and no
server — including straight off `file://`. `td-refresh` also writes the same telemetry
into the snapshot so the hosted page paints the map before the live fetch lands, and the
last pull is cached in `localStorage` for the same reason. Older data never overwrites
newer, whichever route it arrives by.

DShield publishes no target geography (its targets are its own sensors, worldwide), so
there is no destination country and the map does not draw arcs pretending otherwise. The
destination dimension is the ports column. If DShield is unreachable the last pull stays
on screen, labelled with its age; with nothing cached the panel hides. Feeds are
unaffected either way.

The world outline and country centroids are inlined in the page (~24 KB, Natural Earth
110m, public domain) so it stays one portable file with no CDN. `tools/gen-map.py`
regenerates them.

## Reading it

| | |
|---|---|
| `/` | focus the filter |
| `r` | poll now (in-browser; slower, see below) |
| `u` | unread only |

River or by-source layout, 6 h to 14 d windows, domain tabs with unread counts, pinning,
CVE badges, and a saved color theme selector: Midnight, Daylight, Violet, Neon mint,
Crimson, and Slate & coral. Read/pinned state lives in `localStorage`, per browser.

The in-page **Poll now** button exists as a fallback and is the slow path — browsers can't
fetch most feeds directly (CORS), so it relays through a third-party service and is rate
limited. The scheduled poll is the real one.

## Known limits

- **Some sources refuse automated clients.** Reddit returns empty to non-browser clients;
  Cloudflare-challenged feeds (Check Point Research) return a 0-byte body. Those are
  dropped rather than shown as broken.
- **GitHub disables scheduled workflows after 60 days without repository activity.**
  If the snapshot goes stale, check whether the schedule was disabled and re-enable it.
- **`arXiv`'s `rss.arxiv.org` feeds return 0 items outside announcement windows** — this
  uses the `export.arxiv.org` API endpoint instead.

## Tests

```bash
node test-theme.cjs && node test-map.cjs
```

Theme selection and persistence; map geometry bounds, bubble scaling, and every
degenerate telemetry shape. They are not wired into the poll workflow — run them before
pushing a page change.

## License

MIT
