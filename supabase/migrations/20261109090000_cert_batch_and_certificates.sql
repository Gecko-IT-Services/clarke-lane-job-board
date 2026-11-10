-- Certificates (Mandy, 9 Nov): the laser operator types the mill certificate or batch number against each part from
-- his PC instead of writing it on the front sheet (it then prints on the sheet, fills the certificate of conformity
-- and stays on the order for good), and the suppliers' certificates are filed on the order like drawings.

-- The cert / batch number on a line. Staff, the shop floor included, may set it, and nothing else on the line:
-- job_lines has no update policy, so this goes through one function that touches only that column.
alter table public.job_lines add column if not exists cert_batch text not null default '';
create or replace function public.set_line_batch(p_line_id bigint, p_batch text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Only staff can set a certificate number'; end if;
  update public.job_lines set cert_batch = left(trim(coalesce(p_batch, '')), 80) where id = p_line_id;
  if not found then raise exception 'Line not found'; end if;
end $$;
revoke all on function public.set_line_batch(bigint, text) from public;
grant execute on function public.set_line_batch(bigint, text) to authenticated;

-- A file on a job is a drawing (as before) or a certificate. Certificates are filed in SharePoint under
-- Factory Jobs › Documents › Certificates › the SO number; the office adds and removes them, everyone reads them.
alter table public.job_files add column if not exists kind text not null default 'drawing';
alter table public.job_files drop constraint if exists job_files_kind_check;
alter table public.job_files add constraint job_files_kind_check check (kind in ('drawing', 'cert'));
