-- Levi, 19 Oct: Tap and C/Sink are one process, "Tap & C/Sink", in Tap's place.
-- A job that had both keeps one row, done only if both were done (the later tick kept).
alter table public.job_processes drop constraint job_processes_process_check;

update public.job_processes t
   set process = 'Tap & C/Sink',
       done_at = case when t.done_at is not null and c.done_at is not null then greatest(t.done_at, c.done_at) end,
       done_by = case when t.done_at is not null and c.done_at is not null
                      then case when c.done_at > t.done_at then c.done_by else t.done_by end end
  from public.job_processes c
 where c.job_id = t.job_id and t.process = 'Tap' and c.process = 'C/Sink';
delete from public.job_processes c
 where c.process = 'C/Sink'
   and exists (select 1 from public.job_processes t where t.job_id = c.job_id and t.process = 'Tap & C/Sink');
update public.job_processes set process = 'Tap & C/Sink' where process in ('Tap', 'C/Sink');

alter table public.job_processes add constraint job_processes_process_check
  check (process in ('Laser', 'Fold', 'Cut & Drill', 'Tap & C/Sink', 'Insert', 'Weld', 'P/Coat Paint',
                     'Plating / Anodising', 'Rolling'));
