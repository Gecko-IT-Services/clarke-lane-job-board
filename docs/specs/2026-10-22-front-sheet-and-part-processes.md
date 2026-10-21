# The front sheet and processes per part (22 Oct)

Mandy, for Levi: "Levi would like the front sheet set out like the Xero version, as each part may need a different process. He also said all the processes need to be displayed on the TV screen and just the individual processes on each department's tablet."

Until now the processes were ticked once for the whole order, and the printed job sheet listed them in a table of their own. Now each part line has its own processes, the printed sheet is the Xero-style **Sales order front sheet**, and a station's tablet shows only its own step.

## 1. Storage
- Migration `20261022120000_line_processes.sql`: `job_lines.processes text[] not null default '{}'`, with a check that it only holds Levi's nine process names (added only if missing, so the file can be run again).
- `create_job` and `amend_job` are replaced with the same code as `20261022090000_line_part_no.sql`, plus each line's `processes` (a JSON array in the line; missing or null = `'{}'`).
  - `create_job`: the order's `job_processes` rows are the processes sent plus every process any line needs, each once.
  - `amend_job`: a line sent without `processes` keeps what it has (as `part_no` does). After the lines are saved, any process a line now needs that the order does not have yet is added. Nothing is removed in SQL: the app removes processes no line needs, as before (`setJobProcesses`, which now ignores a process already there).
- `job_processes` is unchanged and stays the order's processes: ticked done once per order, as today. RLS is unchanged; `job_lines` still carries no price.
- The app's line gets `procs` (`src/data.js` `loadJobs`).

## 2. How old orders read
- A line with `processes = '{}'` (every line from before this) needs every process on its order, so Jobs, the shop floor, the TV and the front sheet read exactly as before.
- `lineProcs(job, line)` in `src/core/jobs.js` is the one place that decides: the line's own processes, kept to the order's processes, in Levi's order; `needed(job)` for an older line. A process on the order that no line lists (added on its own, for example from a drawing's hint) is needed by every line, as it was before. A line that would end up with nothing reads as every process: a line that needs no process at all is not something the board holds yet.
- `linesFor(job, process)`: the lines that need a process. `partsLeft(job, process)`: parts still to make, only those lines when a process is given.

## 3. The order form
- Under the lines, a **Processes** table: a row per line (named as it reads on the board, or "Line 2" while blank), a narrow tick box per process headed with the short names, and with more than one line an **All lines** row on top that ticks or unticks a process on every line in one click.
- The order's processes are every process ticked on some line; "Tick at least one process" still applies to that. Each saved line carries its `processes`.
- Ticked for you: from a quote, each line from its own quote line (carriage gets every process the quote suggested); "the same part made before" ticks only the matching line, with the processes that line had then; repeat and amend load each line's processes; a new line starts with the line above's ticks; split into call-offs keeps each line's ticks.
- A line with nothing ticked goes through every process on the order (said under the table).

## 4. The front sheet
- The **Job sheet** button is now **Front sheet** (open job and order acknowledgement); the PDF name says Front sheet.
- Set out like Xero's Sales Order Front Sheet: the logo, "Sales order front sheet" and the SO number; the customer, delivery address and contact on the left; Order no, Order date, Customer PO, Our quote and **Required** (bold, larger) on the right, plus the call-off rows when relevant. No account code: the board does not hold Xero's.
- One row per line being made on this sheet (the **To make** picking is unchanged): Qty, Part number, Description, a Due column only when the sheet covers more than one date, the call-off PO column when there is one, then a column per process on the order. A box where that part needs the process (ticked if done already), an empty cell where it does not.
- The Notes box when there are notes, an empty **Certificate batch no.** box to write in, and the footer. No prices. The old process table, "Not needed" line and the three blank lines are gone.

## 5. The tablets
- A station (`src/floor.js`) shows on each card only the parts that need it, and one big step: its own (tap to tick, as before). Under it, in plain words, where these parts go next (**Then: Weld → P/Coat**) or **Last step: back to the office**. When a step before this one is still to do for these parts, a small amber line says so: **Before this: Laser, Fold still to do**.
- The steps before and after are those the parts at this station need, so a part that is never welded is not sent to Weld.
- **All jobs** is unchanged: every part and the whole route. The status line, send-out buttons and notes are unchanged.

## 6. The TV
- Unchanged: a column per process, marked from the order's processes, so it shows every process on the order even when the parts need different ones (test in `tests/tv.mjs`).

## 7. How to check
- In Supabase's SQL editor, after running the migration, this returns `true`:
  `select exists (select 1 from information_schema.columns where table_name='job_lines' and column_name='processes');`
- Practice page (`dev/smoke.html?role=office`): SO-9782's cabinet, door and shelf each have their own processes; press **Front sheet** on it. `?role=floor`: tap **Weld** to see only the cabinet; tap **Fold** for the amber "Before this" line.

Tests: `tests/jobs.mjs` (`lineProcs`, `linesFor`, `partsLeft` for a station, older lines), `tests/drawing.mjs` (same part made before: that line's processes), `tests/tv.mjs` (every process on the order).
