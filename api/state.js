import { get, put } from '@vercel/blob';

const PATH = 'luz/state.json';
const PEOPLE = new Set(['omer', 'shaham']);
const EMPTY = () => ({ checks: {}, notes: {}, scores: {}, updated: 0 });

async function readState() {
  const r = await get(PATH, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return EMPTY();
  const text = await new Response(r.stream).text();
  try { return { ...EMPTY(), ...JSON.parse(text) }; } catch { return EMPTY(); }
}

const clip = (v, n) => String(v ?? '').slice(0, n);

function apply(s, op) {
  if (!op || typeof op !== 'object') return;
  if (op.kind === 'check' && PEOPLE.has(op.who) && op.id) {
    const id = clip(op.id, 80);
    s.checks[id] = { ...(s.checks[id] || {}), [op.who]: !!op.value };
  } else if (op.kind === 'note' && op.date) {
    s.notes[clip(op.date, 20)] = clip(op.text, 3000);
  } else if (op.kind === 'score' && PEOPLE.has(op.who) && op.sim && ['a', 'b'].includes(op.part)) {
    const sim = clip(op.sim, 20);
    s.scores[sim] = s.scores[sim] || {};
    s.scores[sim][op.who] = { ...(s.scores[sim][op.who] || {}), [op.part]: clip(op.value, 8) };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await readState());
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const ops = Array.isArray(body.ops) ? body.ops.slice(0, 50) : [];
      const s = await readState();
      ops.forEach(op => apply(s, op));
      s.updated = Date.now();
      await put(PATH, JSON.stringify(s), {
        access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json'
      });
      return res.status(200).json(s);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
