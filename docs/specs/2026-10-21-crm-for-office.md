# CRM for the office, Customers inside it (21 Oct)

Philip: Mandy will use the CRM every day, more than Levi; she must not see the company's financial position, which is management only.

- The **CRM** tab is now in the menu for Levi and Mandy (office). It has three parts: **Follow-ups**, **Customers** (moved from the Sales orders button; the CRM tab stays lit) and **Ideas**.
- Levi only (`md`): **This month** (orders booked against the target, the gap, likely from quotes), the open quote totals (quoted and likely), customer spend (Last 12 months on the get-back-in-touch list and on a customer's page), the totals of a customer's open quotes and unpaid invoices, break-even and target (`board_settings`).
- Mandy also gets: quotes to chase (each quote's own value, as on Won quotes), Log a call / Lost / Follow up on, AI emails, the monthly news email, Due a reorder, Could give us more, the AI customer summary, Ideas and customer research, and the CRM tiles in Home's Today.
- Migration `20261021180000_crm_for_office.sql`: `quote_follow`, `sales_actions`, `sales_emails`, `customer_insights`, `customer_research` and `sales_ideas` move from `is_md()` to `is_office()`. `board_settings` stays `is_md()`.
- `sales-ai`: `checkin`, `summary`, `ideas` and `research` allow `office` too. The facts sent never carry money.
