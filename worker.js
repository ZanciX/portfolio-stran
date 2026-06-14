// NexCraft Anthropic API proxy — Cloudflare Worker
//
// Deploy: `wrangler deploy`
// Secret: `wrangler secret put ANTHROPIC_KEY`
// Route:  attach this worker to nexcraft.org/api/chat in the Cloudflare dashboard
//         (Workers & Pages → your worker → Triggers → Add Route)
//
// Fully transparent body pass-through: the request body bytes are forwarded to
// Anthropic verbatim, the upstream response is returned to the caller verbatim.
// The only thing this worker adds is the API key header (server-side) and CORS.

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
      return new Response(
        JSON.stringify({ error: 'Server is missing ANTHROPIC_KEY' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Read the raw body — no JSON parsing, no validation, no shape checks.
    // Whatever the client sent goes straight to Anthropic.
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
      return new Response(
        JSON.stringify({ error: 'Upstream request failed', detail: String(e) }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Forward upstream response verbatim (status code, body, content-type).
    const upstreamBody = await upstream.text();
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  },
};
