const { readJsonBody, sendJson } = require('./api_response');
const { isPlainObject } = require('./validation');

const DEFAULT_DIFY_API_BASE_URL = 'https://api.dify.ai/v1';

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
      return sendJson(res, 502, {
        ok: false,
        error: {
          code: 'UPSTREAM_ERROR',
          message: `Dify API returned HTTP ${upstream.status}`,
        },
      });
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
  buildDifyRequestBody,
  chatMessagesUrl,
  handleChatRequest,
  pipeUpstreamBody,
  streamHeaders,
  validateChatBody,
};
