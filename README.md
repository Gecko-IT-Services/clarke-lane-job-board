# Clarke Lane Job Board

Sales orders, job board, shop-floor ticks and despatch notes for Clarke Lane Engineering.
Design: `docs/specs/2026-10-14-job-board-design.md`.

- Quotes stay in Levi's CLE Quote Calculator (SharePoint, site FactoryJobs), read only.
- The board's own data is in Supabase project `rdvkkftgjyrmraotcrfz` (Clarke Lane's account).
  Schema only in `supabase/migrations/`, applied by the Supabase GitHub integration on merge to `main`.
- Run the tests before any commit: `for t in tests/*.mjs; do node $t; done`
