# NexCraft Worker — setup & deploy

The Cloudflare Worker (`worker.js`) handles two things:

1. **Chat proxy** — `POST /api/chat` forwards to Anthropic with the server-side `ANTHROPIC_KEY` secret.
2. **Bookings** — `GET /api/bookings?date=YYYY-MM-DD` lists taken slots, `POST /api/booking` reserves one. Data lives in the Cloudflare KV namespace `BOOKINGS`.

## First-time deploy

```bash
npm install -g wrangler
wrangler login

# 1. Create the KV namespace and paste the returned id into wrangler.toml
wrangler kv:namespace create BOOKINGS
# → Edit wrangler.toml and replace REPLACE_WITH_KV_NAMESPACE_ID with the id

# 2. Set the Anthropic key as a secret
wrangler secret put ANTHROPIC_KEY
# → paste your sk-ant-... when prompted

# 3. Deploy
wrangler deploy
```

The worker will be live at `https://nexcraft-chat-proxy.<your-subdomain>.workers.dev`. If you want it on `nexcraft.org/api/*`, add a Worker Route in the Cloudflare dashboard.

## Inspecting bookings

```bash
# List the first 100 keys (each key looks like 2026-06-17:18:00)
wrangler kv:key list --namespace-id <YOUR_NAMESPACE_ID>

# Read a single booking
wrangler kv:key get --namespace-id <YOUR_NAMESPACE_ID> "2026-06-17:18:00"

# Delete one (e.g. cancel a booking)
wrangler kv:key delete --namespace-id <YOUR_NAMESPACE_ID> "2026-06-17:18:00"
```

## Rotating the Anthropic key

```bash
wrangler secret put ANTHROPIC_KEY   # paste the new key
```

Live within ~30 seconds of the upload.
