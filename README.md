# Clarke Lane Job Board

Sales orders, job board, shop-floor ticks, deliveries and despatch notes for Clarke Lane Engineering,
live at https://jobs.clarke-lane.co.uk. Design: `docs/specs/2026-10-14-job-board-design.md`.

- Quotes stay in Levi's CLE Quote Calculator (SharePoint, site FactoryJobs), read only.
- The board's own data is in Supabase project `rdvkkftgjyrmraotcrfz` (Clarke Lane's account).
  Schema only in `supabase/migrations/`, applied by the Supabase GitHub integration on merge to `main`.
- Run the tests before any commit: `for t in tests/*.mjs; do node $t; done`

## What's where

| Folder | What it holds |
| --- | --- |
| `index.html`, `src/` | The board itself: one page, plain JavaScript modules, no build step. Pure logic in `src/core/`. |
| `tests/` | One test file per `src/core/` module, plus checks on the page and the migrations. |
| `supabase/migrations/` | Every database change, in order. Never edit an old one; add a new one. |
| `supabase/functions/` | The Xero connection (`xero`) and the AI helpers (`sales-ai`). |
| `docs/specs/` | One short note per change: what it does, why, and the SQL to check it. |
| `dev/` | The practice page (`smoke.html`, made by `make-smoke.py` from made-up data in `fake-data.js`) and the scripts that recorded the help video. |
| `help/` | The help video and its poster image. |
| `icons/`, `manifest.webmanifest` | The home-screen app icon for phones. |

This repository is public: never put real customer names, prices or Clarke Lane's figures in it.
