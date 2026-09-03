# Chat Streaming Proxy

`POST /api/chat` is a server-side streaming proxy between the browser and the Dify Chatflow API.

Current route path in this repository:

```text
api/chat.js
```

The repository currently uses Vercel Node API functions under `api/`; it does not include a Next.js `app/` or `pages/` router.

## Environment Variables

Server-only variables:

```text
DIFY_API_KEY=replace_with_dify_api_key
DIFY_API_BASE_URL=https://api.dify.ai/v1
```

`DIFY_API_KEY` is required. `DIFY_API_BASE_URL` defaults to `https://api.dify.ai/v1` when omitted.

Do not expose these variables to browser code. Local `.env` files are ignored by Git.

## Request Body

```json
{
  "query": "用户消息",
  "conversation_id": "",
  "user": "stable-browser-user-id",
  "inputs": {}
}
```

- `query` is required.
- `conversation_id` may be empty on the first turn and should be sent back on later turns.
- `user` is a stable lightweight browser identifier. The prototype does not implement accounts or authentication.
- `inputs` is optional and defaults to `{}`.

## Streaming Behavior

The proxy calls Dify with:

```json
{
  "response_mode": "streaming"
}
```

It forwards the Dify SSE stream directly to the browser as chunks arrive. It does not parse Dify SSE and does not parse project NDJSON business events.

The browser layer in `lib/client/`:

1. read Dify SSE;
2. extract incremental `answer` content;
3. buffer by newline;
4. parse complete NDJSON lines;
5. reduce each `event.type` into framework-neutral chat state;
6. update the static JavaScript UI incrementally.

The proxy deliberately does not parse either protocol. This keeps the server-side secret boundary small and preserves Dify's streaming response without buffering it.

## Local Verification

Run the project with Vercel CLI so the static files and functions share one origin:

```bash
npx vercel dev
```

The commands below assume Vercel selected port `3000`. Use the port printed by the CLI if it differs.

Missing query:

```bash
curl -i -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Streaming request:

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"query":"帮我推荐海口住宿","conversation_id":"","user":"local-smoke","inputs":{}}'
```
