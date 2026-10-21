-- CRM for the office (Philip, 21 Oct): Mandy works the CRM every day, so quote follow-ups, the sales notes and AI
-- emails log, customer summaries, research and ideas open to the office (Levi and Mandy). The month's figures
-- (board_settings: break-even and target) stay Levi only.
drop policy quote_follow_md on public.quote_follow;
create policy quote_follow_office on public.quote_follow for all to authenticated using (public.is_office()) with check (public.is_office());
drop policy sales_actions_md on public.sales_actions;
create policy sales_actions_office on public.sales_actions for all to authenticated using (public.is_office()) with check (public.is_office());
drop policy sales_emails_md on public.sales_emails;
drop policy sales_emails_md_add on public.sales_emails;
create policy sales_emails_office on public.sales_emails for select to authenticated using (public.is_office());
create policy sales_emails_office_add on public.sales_emails for insert to authenticated with check (public.is_office());
drop policy customer_insights_md on public.customer_insights;
create policy customer_insights_office on public.customer_insights for all to authenticated using (public.is_office()) with check (public.is_office());
drop policy customer_research_md on public.customer_research;
create policy customer_research_office on public.customer_research for all to authenticated using (public.is_office()) with check (public.is_office());
drop policy sales_ideas_md on public.sales_ideas;
create policy sales_ideas_office on public.sales_ideas for all to authenticated using (public.is_office()) with check (public.is_office());
