// NexCraft Anthropic API proxy — Cloudflare Worker
//
// Deploy: `wrangler deploy` (uses the bundled wrangler.toml below)
// Secret: `wrangler secret put ANTHROPIC_KEY`   (paste the sk-ant-... key when prompted)
// Route:  attach this worker to nexcraft.org/api/chat in the Cloudflare dashboard
//         (Workers & Pages → your worker → Triggers → Add Route)
//
// The widget on nexcraft.org POSTs the same JSON body it would have sent to Anthropic
// directly. We forward it, attach the API key from env, and return the response.

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(status, payload, cors) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Route guard
    if (url.pathname !== '/api/chat') {
      return new Response('Not found', { status: 404, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { ...cors, Allow: 'POST' },
      });
    }

    if (!env.ANTHROPIC_KEY) {
      return json(500, { error: 'Server is missing ANTHROPIC_KEY' }, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json(400, { error: 'Invalid JSON body' }, cors);
    }

    let upstream;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return json(502, { error: 'Upstream request failed' }, cors);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  },
};
