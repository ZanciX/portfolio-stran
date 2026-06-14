# NexCraft chat-proxy Worker — setup

The widget on `index.html` calls `https://nexcraft.org/api/chat`. That endpoint is served by this Cloudflare Worker (`worker.js`).

## Deploy

```bash
npm install -g wrangler
wrangler login
wrangler deploy            # publishes to nexcraft-chat-proxy.YOUR-SUBDOMAIN.workers.dev
wrangler secret put ANTHROPIC_KEY
# paste your sk-ant-... key when prompted
```

## Wire to nexcraft.org/api/chat

1. Cloudflare dashboard → Workers & Pages → `nexcraft-chat-proxy` → **Triggers** → **Add Route**.
2. Route: `nexcraft.org/api/chat*` — Zone: `nexcraft.org`.

That's it — the widget will start working immediately.

## Rotate the key

If you ever leak the key:

```bash
wrangler secret put ANTHROPIC_KEY   # paste the new key
```

The change is live on the worker within ~30 seconds.
