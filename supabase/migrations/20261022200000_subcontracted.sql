-- Mandy, 22 Oct: "could you please add a subcontracted box as it won't let me create the order unless a box
-- is ticked". A tenth process, Subcontracted: the whole job made by another company. It goes through Sent out
-- on the shop floor like powder coat and plating. Both checks learn the name; everything else is unchanged.
alter table public.job_processes drop constraint job_processes_process_check;
alter table public.job_processes add constraint job_processes_process_check
  check (process in ('Laser', 'Fold', 'Cut & Drill', 'Tap & C/Sink', 'Insert', 'Weld', 'P/Coat Paint',
                     'Plating / Anodising', 'Rolling', 'Subcontracted'));

alter table public.job_lines drop constraint if exists job_lines_processes_check;
alter table public.job_lines add constraint job_lines_processes_check
  check (processes <@ array['Laser', 'Fold', 'Cut & Drill', 'Tap & C/Sink', 'Insert', 'Weld', 'P/Coat Paint',
                            'Plating / Anodising', 'Rolling', 'Subcontracted']::text[]);
