// Aged debt: invoices over 60 days and past due, by customer; the chase email.
import assert from 'node:assert/strict';
const { agedDebt, debtFor, recentChase, chaseEmail } = await import('../src/core/debts.js');

const inv = (id, customer, date, due, owed, extra = {}) => ({ id, number: 'INV-' + id, customer, contactId: 'c-' + customer.length, date, due, owed, total: owed, reference: '', ...extra });
const today = '2026-10-20';
const list = agedDebt([
  inv(1, 'VFS (Southampton) Ltd', '2026-07-15', '2026-08-31', 1200),         // 97 days, past due
  inv(2, 'VFS (Southampton) Ltd', '2026-08-10', '2026-09-30', 300.5),        // 71 days, past due
  inv(3, 'VFS (Southampton) Ltd', '2026-10-01', '2026-11-30', 999),          // recent: owed, not over
  inv(4, 'Wessex International', '2026-08-01', '2026-12-31', 500),          // old but on longer terms in Xero
  inv(5, 'BSA Regal Group LTD', '2026-08-15', '2026-09-30', 80),             // 66 days
  inv(6, 'Paid Up Ltd', '2026-06-01', '2026-07-31', 0),                      // nothing owed
], today);
assert.deepEqual(list.map(c => c.customer), ['VFS (Southampton) Ltd', 'BSA Regal Group LTD'], 'most owed first; longer terms and paid left out');
assert.equal(list[0].over, 1500.5);
assert.equal(list[0].owedAll, 2499.5, 'everything owed is kept too');
assert.deepEqual(list[0].invoices.map(x => x.number), ['INV-1', 'INV-2'], 'oldest first, recent one not counted');
assert.equal(list[0].oldest.age, 97);
assert.equal(agedDebt([inv(7, 'Edge Ltd', '2026-08-21', '2026-09-30', 10)], today).length, 0, 'exactly 60 days is not over');
assert.equal(debtFor(list, 'BSA Regal Group Limited')?.over, 80, 'Ltd and Limited are the same customer');
assert.equal(debtFor(list, 'Nobody'), null);

const chases = [{ customer: 'VFS (Southampton) Ltd', at: '2026-10-16T09:00:00Z', by: 'Mandy' }];
assert.equal(recentChase(chases, 'VFS (Southampton) LTD', today)?.by, 'Mandy', 'chased 4 days ago');
assert.equal(recentChase(chases, 'VFS (Southampton) Ltd', '2026-10-24'), null, 'a week later: due another chase');

const e = chaseEmail({ debt: list[0], person: 'Nicola Smith', links: { 1: 'https://in.xero.com/abc' }, from: 'Mandy' });
assert.match(e.subject, /2 invoices overdue \(£1,500\.50\)/);
assert.match(e.html, /Dear Nicola,/);
assert.match(e.html, /INV-1[\s\S]*INV-2/);
assert.match(e.html, /href="https:\/\/in\.xero\.com\/abc"/);
assert.match(e.html, /30 days from the end of the month/);
assert.doesNotMatch(e.html, /INV-3/, 'recent invoices are not chased');
assert.match(chaseEmail({ debt: list[1], from: 'Levi' }).html, /Hello,/);
console.log('debts: ok');
