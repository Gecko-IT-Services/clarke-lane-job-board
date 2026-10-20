// Clarke Lane Job Board: Levi's AI-written sales emails (Philip, 20 Oct: "use Sonnet 5.5 to compose tempting
// emails to their existing client base"). Levi only. The board sends the facts it is allowed to use (what the
// customer buys and when, open quotes, Levi's own angle; never prices); Claude writes { subject, greeting,
// paragraphs } from those facts alone; the board turns it into an Outlook draft for Levi to check and send.
// Nothing is ever sent from here. Every call is logged with its cost in public.sales_emails, under a daily cap.
//
// Secret (Supabase › Edge Functions › Secrets): ANTHROPIC_API_KEY.
// Optional: SALES_AI_DAILY_LIMIT (default 30), SALES_AI_MODEL (default claude-sonnet-5-5).
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MODEL = Deno.env.get('SALES_AI_MODEL') || 'claude-sonnet-5-5';
const DAILY = Number(Deno.env.get('SALES_AI_DAILY_LIMIT') || 30);
const PRICE_IN = 2, PRICE_OUT = 10;   // $ per million tokens, Claude Sonnet 5.5 list price (Oct 2026)

const ORIGINS = ['https://jobs.clarke-lane.co.uk', 'http://localhost:8080'];
const cors = (req: Request, res: Response) => {
  const o = req.headers.get('origin') || '';
  res.headers.set('Access-Control-Allow-Origin', ORIGINS.includes(o) ? o : ORIGINS[0]);
  res.headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return res;
};
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function md(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to the job board first.');
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data, error } = await user.rpc('me');
  if (error) throw new HttpError(401, 'Your job board sign-in has expired. Reload the page.');
  const me = data?.[0];
  if (me?.role !== 'md') throw new HttpError(403, 'Only Levi can write sales emails with AI.');
  return me as { email: string; name: string };
}

const SYSTEM = `You write short sales emails for a small UK sheet metal and fabrication company, sent by its managing director to an existing customer.
You are given a JSON object of facts. Use only those facts. Never invent products, part numbers, prices, discounts, offers, deadlines, capacity or news; only mention something like that when it is in angleFromLevi. Never mention money or how much they spend.
The aim: a warm, personal email that makes it easy for the customer to send their next order or drawing, based on what they actually buy (theyBuy) and how long it has been (quietForDays, usualDaysBetweenOrders). If they have open quotes, mention them by quote number and offer to help them go ahead. If angleFromLevi is given, build the email around it.
Style: British English, plain and friendly, not salesy, no exclamation marks, no buzzwords, no em dashes. 3 to 5 short paragraphs, under 150 words in total. The greeting uses contactFirstName ("Hi Sam,") or "Hello," if there is none. Do not add a sign-off or name: it is added afterwards. The subject is short and specific, not clickbait.`;

const SCHEMA = { type: 'object', additionalProperties: false, required: ['subject', 'greeting', 'paragraphs'],
  properties: { subject: { type: 'string' }, greeting: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } } } };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
  let me: { email: string; name: string } | null = null, customer = '';
  try {
    me = await md(req);
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) throw new HttpError(503, 'AI emails are not set up yet: ANTHROPIC_API_KEY is missing from Supabase › Edge Functions › Secrets.');
    const body = await req.json().catch(() => ({}));
    const facts = body?.facts;
    if (!facts || typeof facts !== 'object' || !facts.customer) throw new HttpError(400, 'No customer facts were sent.');
    customer = String(facts.customer).slice(0, 200);
    const text = JSON.stringify(facts);
    if (text.length > 20000) throw new HttpError(400, 'Too much detail for one email.');
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from('sales_emails').select('id', { count: 'exact', head: true }).eq('ai', true).gte('created_at', since);
    if ((count || 0) >= DAILY) throw new HttpError(429, `Today's limit of ${DAILY} AI emails is reached. It resets after 24 hours.`);

    const client = new Anthropic({ apiKey: key });
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',   // a declined request is re-run on Anthropic's recommended model
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Facts:\n${text}` }],
    });
    if (res.stop_reason === 'refusal') throw new HttpError(422, 'The AI would not write this email. Try a different angle, or write it yourself.');
    if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'The AI ran out of room writing the email. Try again.');
    const out = res.content.find(b => b.type === 'text');
    let email: { subject: string; greeting: string; paragraphs: string[] };
    try { email = JSON.parse(out && out.type === 'text' ? out.text : ''); } catch { throw new HttpError(502, 'The AI\'s reply could not be read as an email. Try again.'); }
    const inT = res.usage.input_tokens + (res.usage.cache_read_input_tokens || 0), outT = res.usage.output_tokens;
    const cost = Math.round((inT * PRICE_IN + outT * PRICE_OUT) / 1e6 * 10000) / 10000;
    await admin.from('sales_emails').insert({ customer, kind: 'checkin', ai: true, model: res.model, input_tokens: inT, output_tokens: outT, cost_usd: cost, created_by: me.email });
    return cors(req, json({ ...email, model: res.model, costUsd: cost }));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof Anthropic.APIError ? 502 : 500;
    const msg = e instanceof Anthropic.RateLimitError ? 'The AI is busy. Try again in a minute.'
      : e instanceof Anthropic.AuthenticationError ? 'The AI key in Supabase was not accepted. Ask Gecko IT to check ANTHROPIC_API_KEY.'
      : (e as Error).message;
    if (me && customer && !(e instanceof HttpError && [400, 429, 503].includes(e.status))) await admin.from('sales_emails').insert({ customer, kind: 'checkin', ai: true, model: MODEL, ok: false, error: msg.slice(0, 500), created_by: me.email });
    return cors(req, json({ error: msg }, status));
  }
});
