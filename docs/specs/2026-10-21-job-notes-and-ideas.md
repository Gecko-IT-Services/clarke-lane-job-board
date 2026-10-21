# Job notes, CRM rename and Ideas (21 Oct)

## CRM
The Sales tab is now called **CRM** (still Levi only; the address stays `#sales`). It has two views: **Follow-ups** (everything that was there) and **Ideas**.

## Notes on a job
Levi and Mandy leave notes for the shop floor on the job itself; the shop floor answers on the same job.
- Table `job_notes` (migration `20261021120000_job_notes.sql`): anyone on the board reads and adds; `from_floor` must match the login; "Got it" goes through `job_note_seen()` so nobody edits what someone else wrote; Levi and Mandy delete.
- The shop floor shares one login, so a note from a tablet carries a typed name (kept on that tablet).
- Shown: the job's details (a conversation), each shop floor card (newest note, **New note** and **Got it**), a banner on the station screen, the TV's Notes column (yellow until Got it), and Home's **From the shop floor** for Levi and Mandy.
- Replying marks the other side's notes as seen. Never prices: the shop floor and TV show notes.

## Ideas (Levi only)
- **Think of ideas**: the `sales-ai` function (kind `ideas`) gets facts built by `core/ideas.js` `ideasFacts()`: customers with what they buy, how often, trend in words (never money), work never had from us, repeat parts due, quotes to chase and win rate, the enquiry funnel, and saved research. Returns 6 to 8 ideas; saved in `sales_ideas` with a status.
- **Customer research** (kind `research`): Claude Sonnet 5.5 with web search and web fetch reads the customer's website (guessed from their email domains, editable) and public pages, writes notes with sources, then a second call shapes them into about / what's new / where we could help. Saved in `customer_research`, one row per customer. Daily cap 25 (`SALES_AI_RESEARCH_LIMIT`).
- Ideas and openings feed the existing **Write an email** (Outlook draft) and **Make a task**. Nothing is sent or posted.
- Migration `20261021140000_ideas.sql`. Needs `ANTHROPIC_API_KEY` in Supabase secrets (the same key as the other AI parts).
