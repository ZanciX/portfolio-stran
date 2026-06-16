// NexCraft API worker — handles chat proxy and meeting bookings.
//
// Routes:
//   POST /api/chat                — transparent Anthropic proxy
//   GET  /api/bookings?date=YYYY-MM-DD — taken time slots for a date
//   POST /api/booking             — reserves date+time and stores booking
//
// Secrets / bindings:
//   ANTHROPIC_KEY   secret      `wrangler secret put ANTHROPIC_KEY`
//   BOOKINGS        KV namespace  `wrangler kv:namespace create BOOKINGS`
//                                (paste the returned id into wrangler.toml)
//
// KV keys are `${date}:${time}` (e.g. `2026-06-17:18:00`). Values are JSON
// {name, email, company, message, createdAt}.

const ALLOWED_ORIGINS = new Set([
  'https://nexcraft.org',
  'https://www.nexcraft.org',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://nexcraft.org';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(status, payload, cors) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const ALLOWED_TIMES = new Set(['17:00','18:00','19:00','20:00','21:00','22:00']);

// Returns null if valid, otherwise an error string.
function validateBookable(dateStr, timeStr) {
  if (!DATE_RE.test(dateStr)) return 'date must be YYYY-MM-DD';
  if (!TIME_RE.test(timeStr)) return 'time must be HH:MM';
  if (!ALLOWED_TIMES.has(timeStr)) return 'time must be between 17:00 and 22:00 on the hour';
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return 'invalid date';
  // UTC day-of-week: 0=Sun..6=Sat. Only Wed (3) and Sat (6) bookable.
  const dow = d.getUTCDay();
  if (dow !== 3 && dow !== 6) return 'bookings are only available on Wednesdays and Saturdays';
  return null;
}

async function handleListBookings(url, env, cors) {
  const date = url.searchParams.get('date');
  if (!date || !DATE_RE.test(date)) {
    return jsonResponse(400, { error: 'date query param required (YYYY-MM-DD)' }, cors);
  }
  if (!env.BOOKINGS) {
    return jsonResponse(500, { error: 'BOOKINGS KV namespace not bound' }, cors);
  }
  const list = await env.BOOKINGS.list({ prefix: date + ':' });
  const taken = list.keys.map(k => k.name.slice(date.length + 1));
  return jsonResponse(200, { date, taken }, cors);
}

async function handleCreateBooking(request, env, cors) {
  if (!env.BOOKINGS) {
    return jsonResponse(500, { error: 'BOOKINGS KV namespace not bound' }, cors);
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'invalid JSON body' }, cors);
  }
  const { date, time, name, email, company, message } = body || {};
  if (!date || !time || !name || !email || !message) {
    return jsonResponse(400, { error: 'missing required fields: date, time, name, email, message' }, cors);
  }
  const validationErr = validateBookable(date, time);
  if (validationErr) {
    return jsonResponse(400, { error: validationErr }, cors);
  }
  const key = `${date}:${time}`;
  const existing = await env.BOOKINGS.get(key);
  if (existing) {
    return jsonResponse(409, { error: 'slot already booked' }, cors);
  }
  const record = {
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    company: String(company || '').slice(0, 200),
    message: String(message).slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  await env.BOOKINGS.put(key, JSON.stringify(record));
  return jsonResponse(200, { ok: true, key }, cors);
}

async function handleChat(request, env, cors) {
  if (!env.ANTHROPIC_KEY) {
    return jsonResponse(500, { error: 'Server is missing ANTHROPIC_KEY' }, cors);
  }
  const rawBody = await request.text();
  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: rawBody,
    });
  } catch (e) {
    return jsonResponse(502, { error: 'Upstream request failed', detail: String(e) }, cors);
  }
  const upstreamBody = await upstream.text();
  return new Response(upstreamBody, {
    status: upstream.status,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/bookings' && request.method === 'GET') {
      return handleListBookings(url, env, cors);
    }
    if (url.pathname === '/api/booking' && request.method === 'POST') {
      return handleCreateBooking(request, env, cors);
    }
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env, cors);
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};
