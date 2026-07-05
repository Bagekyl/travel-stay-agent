const { readJsonBody, sendJson } = require('./api_response');
const { isPlainObject } = require('./validation');

const DEFAULT_DIFY_API_BASE_URL = 'https://api.dify.ai/v1';
const UPSTREAM_ERROR_BODY_LIMIT = 2048;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_DIFY_API_BASE_URL).replace(/\/+$/, '');
}

function chatMessagesUrl(baseUrl) {
  return `${cleanBaseUrl(baseUrl)}/chat-messages`;
}

function validateChatBody(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'request body must be a JSON object',
      },
    };
  }
  if (typeof body.query !== 'string' || body.query.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'query is required',
      },
    };
  }
  if (body.conversation_id !== undefined && typeof body.conversation_id !== 'string') {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'conversation_id must be a string',
      },
    };
  }
  if (body.user !== undefined && typeof body.user !== 'string') {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'user must be a string',
      },
    };
  }
  if (body.inputs !== undefined && !isPlainObject(body.inputs)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'inputs must be an object',
      },
    };
  }
  return { ok: true };
}

function buildDifyRequestBody(body) {
  return {
    inputs: body.inputs || {},
    query: body.query,
    response_mode: 'streaming',
    conversation_id: body.conversation_id || '',
    user: body.user || 'travel-stay-agent-browser-user',
  };
}

function streamHeaders(upstreamContentType = 'text/event-stream; charset=utf-8') {
  return {
    'Content-Type': upstreamContentType,
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

function writeHeaders(res, headers) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

async function pipeWebStreamToNodeResponse(body, res) {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
}

async function pipeNodeStreamToNodeResponse(body, res) {
  for await (const chunk of body) {
    res.write(chunk);
  }
}

async function pipeUpstreamBody(body, res) {
  if (typeof body.getReader === 'function') {
    await pipeWebStreamToNodeResponse(body, res);
    return;
  }
  if (typeof body[Symbol.asyncIterator] === 'function') {
    await pipeNodeStreamToNodeResponse(body, res);
    return;
  }
  throw new Error('unsupported upstream stream body');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeErrorText(value, redactions = []) {
  let text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi, 'Authorization: Bearer [redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  for (const secret of redactions.filter(Boolean)) {
    text = text.replace(new RegExp(escapeRegExp(secret), 'g'), '[redacted]');
  }
  return text.slice(0, UPSTREAM_ERROR_BODY_LIMIT);
}

async function readLimitedWebStream(body, limit) {
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = limit - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

async function readLimitedNodeStream(body, limit) {
  const chunks = [];
  let total = 0;
  for await (const value of body) {
    if (!value || total >= limit) break;
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const remaining = limit - total;
    const chunk = buffer.length > remaining ? buffer.subarray(0, remaining) : buffer;
    chunks.push(chunk);
    total += chunk.length;
    if (buffer.length > remaining) break;
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readUpstreamErrorText(upstream, limit = UPSTREAM_ERROR_BODY_LIMIT) {
  if (!upstream?.body) return '';
  if (typeof upstream.body.getReader === 'function') {
    return readLimitedWebStream(upstream.body, limit);
  }
  if (typeof upstream.body[Symbol.asyncIterator] === 'function') {
    return readLimitedNodeStream(upstream.body, limit);
  }
  if (typeof upstream.text === 'function') {
    const text = await upstream.text();
    return text.slice(0, limit);
  }
  return '';
}

async function buildUpstreamErrorPayload(upstream, redactions = []) {
  const payload = {
    ok: false,
    error: {
      code: 'UPSTREAM_ERROR',
      message: 'Dify API request failed',
      upstream_status: upstream.status,
    },
  };

  let text = '';
  try {
    text = await readUpstreamErrorText(upstream);
  } catch (_error) {
    return payload;
  }

  const trimmed = text.trim();
  if (!trimmed) return payload;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (typeof parsed.code === 'string') payload.error.upstream_code = sanitizeErrorText(parsed.code, redactions);
      if (typeof parsed.message === 'string') payload.error.upstream_message = sanitizeErrorText(parsed.message, redactions);
      if (typeof parsed.status === 'number' || typeof parsed.status === 'string') {
        payload.error.upstream_status_text = sanitizeErrorText(parsed.status, redactions);
      }
      if (!payload.error.upstream_message && typeof parsed.error === 'string') {
        payload.error.upstream_message = sanitizeErrorText(parsed.error, redactions);
      }
      return payload;
    }
  } catch (_error) {
    // Fall through to safe text summary.
  }

  payload.error.upstream_message = sanitizeErrorText(trimmed, redactions);
  return payload;
}

async function handleChatRequest(req, res, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const abortController = new AbortController();
  let responseStarted = false;
  let responseEnded = false;

  const abortUpstream = () => {
    if (!responseEnded) abortController.abort();
  };
  if (typeof req.on === 'function') req.on('aborted', abortUpstream);
  if (typeof res.on === 'function') res.on('close', abortUpstream);

  try {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'request body must be valid JSON',
        },
      });
    }

    const validation = validateChatBody(body);
    if (!validation.ok) return sendJson(res, 400, validation);

    const apiKey = env.DIFY_API_KEY;
    if (!apiKey) {
      return sendJson(res, 500, {
        ok: false,
        error: {
          code: 'SERVER_CONFIG_MISSING',
          message: 'DIFY_API_KEY is not configured',
        },
      });
    }

    const upstream = await fetchImpl(chatMessagesUrl(env.DIFY_API_BASE_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildDifyRequestBody(body)),
      signal: abortController.signal,
    });

    if (!upstream.ok) {
      return sendJson(res, 502, await buildUpstreamErrorPayload(upstream, [apiKey, `Bearer ${apiKey}`]));
    }

    if (!upstream.body) {
      return sendJson(res, 502, {
        ok: false,
        error: {
          code: 'UPSTREAM_EMPTY_BODY',
          message: 'Dify API response body is empty',
        },
      });
    }

    res.statusCode = 200;
    writeHeaders(res, streamHeaders(upstream.headers?.get?.('content-type') || undefined));
    responseStarted = true;
    await pipeUpstreamBody(upstream.body, res);
    responseEnded = true;
    res.end();
    return undefined;
  } catch (error) {
    if (abortController.signal.aborted || error?.name === 'AbortError') {
      responseEnded = true;
      if (!responseStarted) {
        return sendJson(res, 499, {
          ok: false,
          error: {
            code: 'REQUEST_ABORTED',
            message: 'request was cancelled',
          },
        });
      }
      res.end();
      return undefined;
    }
    if (responseStarted) {
      responseEnded = true;
      res.end();
      return undefined;
    }
    return sendJson(res, 502, {
      ok: false,
      error: {
        code: 'UPSTREAM_FETCH_FAILED',
        message: 'failed to connect to Dify API',
      },
    });
  } finally {
    if (typeof req.off === 'function') req.off('aborted', abortUpstream);
    if (typeof res.off === 'function') res.off('close', abortUpstream);
  }
}

module.exports = {
  buildUpstreamErrorPayload,
  buildDifyRequestBody,
  chatMessagesUrl,
  handleChatRequest,
  pipeUpstreamBody,
  readUpstreamErrorText,
  streamHeaders,
  validateChatBody,
};
