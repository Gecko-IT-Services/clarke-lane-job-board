-- Levi, 19 Oct: "Roll Drill" is renamed "Cut & Drill" (same place in the order) and "Rolling" is a new
-- station, last. Existing ticks move across with the rename.
alter table public.job_processes drop constraint job_processes_process_check;
update public.job_processes set process = 'Cut & Drill' where process = 'Roll Drill';
alter table public.job_processes add constraint job_processes_process_check
  check (process in ('Laser', 'Fold', 'Cut & Drill', 'Tap', 'Insert', 'C/Sink', 'Weld', 'P/Coat Paint',
                     'Plating / Anodising', 'Rolling'));
