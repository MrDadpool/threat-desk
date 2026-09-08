# Threat Desk — personal cyber/IT/AI news dashboard

Replacement for start.me/p/wMrA5z/cyber-threat-intelligence. Local, no accounts,
no hosting, no third-party service holding the source list.

## Files
- `threat-desk.html` — the reader. Feed registry lives in the `FEEDS` object at the top of
  the `<script>`; the latest snapshot is embedded in `var EMBED={...}` further down.
  Set `const OPERATOR = "Your Name"` just below it to put a name in the masthead.
- `tokens.css` — the design tokens, for reference. The page inlines the same values so it
  stays a single portable file; edit both if you change a token.
- `_v1-backup.html` — the pre-redesign reader. Delete when you're happy.
- `td-refresh` — Python 3 fetcher (stdlib only). Reads `FEEDS` out of the HTML, pulls every
  feed in 16 threads, dedupes by title, drops anything older than 14 days, clamps
  future-dated posts to now, rewrites the `EMBED` blob in place.

## Hosting (Cloudflare Pages + GitHub Actions, all free tier)
Repo: https://github.com/MrDadpool/threat-desk (public)
Target URL: https://threatdesk.dadmadeanapp.com

- `main` holds source only. `data/` and `threat-desk.local.html` are gitignored.
- `.github/workflows/poll.yml` runs `./td-refresh` every 30 min (plus manual dispatch),
  assembles `out/` (index.html + data/snapshot.json + _headers) and **force-pushes a
  single-commit `deploy` branch**. The 1 MB snapshot never accumulates in history.
- Cloudflare Pages serves the `deploy` branch. Build command: none. Output dir: `/`.
- Why Actions polls instead of a Worker: free Workers get **10 ms CPU per invocation**,
  which cannot parse 93 XML feeds, and **50 subrequests** per invocation for 93 feeds.
  Actions has neither limit and the poll takes ~5 s. Verified 2026-09-08.
- Access (login) later is free to 50 users — no code change needed.

## Use
1. `./td-refresh` — writes `data/snapshot.json`; serve the folder and open `threat-desk.html`.
2. `./td-refresh --embed --open` — standalone `threat-desk.local.html` for offline/no-server use.
3. Hosted copy needs nothing; the cron keeps it current.

Local auto-refresh (only needed if you also want the local copy current):
```
cat > ~/Library/LaunchAgents/com.threatdesk.refresh.plist <<'P'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.threatdesk.refresh</string>
  <key>ProgramArguments</key><array><string>REPLACE_WITH_ABSOLUTE_PATH/td-refresh</string><string>--quiet</string></array>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
P
launchctl load ~/Library/LaunchAgents/com.threatdesk.refresh.plist
```

## Design
Hallmark redesign, 2026-09-08: genre atmospheric · macrostructure Stat-Led · theme Midnight ·
nav N9 edge-aligned · footer Ft2 status line · no enrichment. Recorded in `.hallmark/log.json`;
the stamp is the first comment in the page's `<style>`.

Reads as monitoring infrastructure: lead figure + worded claim, five counted KPIs, an arrival-volume
column chart, a coverage-by-domain bar set, then the river. **Every figure is counted from the
snapshot — no invented metrics.** The fetcher records per-source latency and reachability, which is
what feeds "93/93 sources live", the cycle time, and the per-feed `ms` in the Sources dialog.

## Reader features
- Views: **River** (merged, newest first, day markers with counts) / **By source** (one panel per feed).
- Domain tabs with unread counts; window 6h / 24h / 3d / 7d / everything retained.
- Filter box (`/`), Unread, Pinned, Mark read, per-row pin.
- CVE-IDs get a red badge; Alerts & CVEs rows get an accent dot. Click a row to expand the summary,
  click the headline to open it. Source column shows feed · domain code (CYB/ADV/OPS/MS/APL/AI).
- Charts: arrival volume (buckets follow the window, peak column in accent, hover for the count) and
  coverage by domain (direct-labelled bars).
- Sources dialog: per-feed enable/disable, item count, real fetch latency, error text.
- Lights toggle (dark default), sticky status line, keys `/` `r` `u`. Reduced-motion respected.
- Read/pinned/disabled state in `localStorage`, so it survives re-polls.

## Status
- 93 feeds, all verified fetching: Cyber News 30, Alerts & CVEs 12, SysAdmin & Ops 14,
  Microsoft 11, Apple 11, AI 15.
- In-browser **Refresh** exists but is the slow path — it needs rss2json as a CORS relay
  and is rate-limited. `./td-refresh` is the real refresh (~5s for all 93).

## Dropped during setup (do not re-add without re-testing)
- Reddit r/sysadmin, r/networking — Reddit blocks non-browser clients, returns empty.
- Check Point Research — Cloudflare JS challenge, HTTP 202 with a 0-byte body.
- Anthropic, MSRC Blog, Google TAG, Google Threat Intelligence, Trend Micro Research,
  The Batch, Ansible Blog — no working public feed found on 2026-09-08.
- `rss.arxiv.org/rss/cs.*` returns 0 items outside announcement windows; using the
  `export.arxiv.org/api/query` Atom endpoint instead.
- Public CORS proxies (allorigins, corsproxy.io, codetabs, cors.lol, whateverorigin,
  feed2json) were all dead, key-gated, or 20s-hanging on 2026-09-08. Hence the local fetcher.

## Next up
- **Waiting on David:** connect Cloudflare Pages to the repo (`deploy` branch) and attach
  `threatdesk.dadmadeanapp.com`. Needs dashboard access; can't be done from the CLI without
  a Wrangler login.
- Then optional: Cloudflare Access in front of it (free to 50 users).

## Watch out
- GitHub disables scheduled workflows after **60 days without repository activity**. Bot
  pushes to `deploy` may not count. If the snapshot goes stale, re-enable the schedule in
  the Actions tab.
- Add feeds by adding a `{n:"Name", u:"url"}` line to `FEEDS` in `threat-desk.html`, then
  re-run `./td-refresh`. The scheduled poll picks the new source up on its next run.
