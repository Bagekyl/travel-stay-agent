const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  buildDifyRequestBody,
  chatMessagesUrl,
  handleChatRequest,
} = require('../lib/dify_chat_proxy');

class MockReq extends EventEmitter {
  constructor(body) {
    super();
    this.method = 'POST';
    this.body = body;
  }
}

class MockRes {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.ended = false;
  }

  setHeader(key, value) {
    this.headers[key.toLowerCase()] = value;
  }

  write(chunk) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  end(chunk) {
    if (chunk) this.write(chunk);
    this.ended = true;
  }

  text() {
    return Buffer.concat(this.chunks).toString('utf8');
  }

  json() {
    return JSON.parse(this.text());
  }
}

function sseResponse(chunks, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
  };
}

function upstreamErrorResponse(body, status = 400, contentType = 'application/json') {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': contentType }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
  };
}

test('builds Dify chat-messages URL', () => {
  assert.equal(chatMessagesUrl('https://example.test/v1/'), 'https://example.test/v1/chat-messages');
});

test('builds Dify streaming request body', () => {
  assert.deepEqual(
    buildDifyRequestBody({
      query: 'hello',
      conversation_id: '',
      user: 'u1',
      inputs: { city: '海口' },
    }),
    {
      inputs: { city: '海口' },
      query: 'hello',
      response_mode: 'streaming',
      conversation_id: '',
      user: 'u1',
    },
  );
});

test('missing query returns invalid request', async () => {
  const req = new MockReq({});
  const res = new MockRes();
  await handleChatRequest(req, res, { env: { DIFY_API_KEY: 'test-key' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'INVALID_REQUEST');
});

test('missing DIFY_API_KEY returns server config error', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, { env: {} });
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().error.code, 'SERVER_CONFIG_MISSING');
});

test('Dify 400 JSON error body returns safe upstream details', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'secret-key', DIFY_API_BASE_URL: 'https://dify.test/v1' },
    fetchImpl: async () => upstreamErrorResponse(JSON.stringify({
      code: 'invalid_param',
      message: 'conversation_id is invalid',
      status: 400,
    }), 400),
  });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.json(), {
    ok: false,
    error: {
      code: 'UPSTREAM_ERROR',
      message: 'Dify API request failed',
      upstream_status: 400,
      upstream_code: 'invalid_param',
      upstream_message: 'conversation_id is invalid',
      upstream_status_text: '400',
    },
  });
  assert.equal(res.text().includes('secret-key'), false);
});

test('Dify 401 JSON error body is returned without leaking credentials', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'secret-key', DIFY_API_BASE_URL: 'https://dify.test/v1' },
    fetchImpl: async () => upstreamErrorResponse(JSON.stringify({
      code: 'unauthorized',
      message: 'Authorization: Bearer secret-key is not allowed',
    }), 401),
  });

  const response = res.json();
  assert.equal(res.statusCode, 502);
  assert.equal(response.error.upstream_status, 401);
  assert.equal(response.error.upstream_code, 'unauthorized');
  assert.equal(response.error.upstream_message.includes('secret-key'), false);
  assert.equal(response.error.upstream_message.includes('Bearer secret-key'), false);
  assert.equal(response.error.upstream_message.includes('[redacted]'), true);
});

test('upstream non-JSON error body returns sanitized text summary', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'test-key' },
    fetchImpl: async () => upstreamErrorResponse(
      '<html><body><h1>Bad Gateway</h1><script>ignore()</script></body></html>',
      503,
      'text/html',
    ),
  });

  const response = res.json();
  assert.equal(response.error.upstream_status, 503);
  assert.equal(response.error.upstream_message.includes('<html>'), false);
  assert.equal(response.error.upstream_message.includes('Bad Gateway'), true);
});

test('overlong upstream error body is truncated', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'test-key' },
    fetchImpl: async () => upstreamErrorResponse('x'.repeat(5000), 400, 'text/plain'),
  });

  const response = res.json();
  assert.equal(response.error.upstream_status, 400);
  assert.equal(response.error.upstream_message.length, 2048);
});

test('empty upstream body returns clear error', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'test-key' },
    fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), body: null }),
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, 'UPSTREAM_EMPTY_BODY');
});

test('streams Dify SSE chunks without buffering the complete response', async () => {
  const req = new MockReq({
    query: 'hello',
    conversation_id: '',
    user: 'u1',
    inputs: {},
  });
  const res = new MockRes();
  let fetchBody;
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'test-key', DIFY_API_BASE_URL: 'https://dify.test/v1' },
    fetchImpl: async (_url, init) => {
      fetchBody = JSON.parse(init.body);
      return sseResponse(['data: {"answer":"a"}\n\n', 'data: {"answer":"b"}\n\n']);
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/event-stream');
  assert.equal(res.headers['cache-control'], 'no-cache, no-transform');
  assert.equal(res.text(), 'data: {"answer":"a"}\n\ndata: {"answer":"b"}\n\n');
  assert.equal(fetchBody.response_mode, 'streaming');
});

test('normal streaming path does not read upstream text body', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  let textCalled = false;
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ...sseResponse(['data: {"answer":"ok"}\n\n']),
      text: async () => {
        textCalled = true;
        return 'should not be called';
      },
    }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.text(), 'data: {"answer":"ok"}\n\n');
  assert.equal(textCalled, false);
});

test('upstream error response does not include Authorization or API key values', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'secret-key' },
    fetchImpl: async () => upstreamErrorResponse(
      'Authorization: Bearer secret-key failed for request',
      400,
      'text/plain',
    ),
  });

  const text = res.text();
  assert.equal(text.includes('secret-key'), false);
  assert.equal(text.includes('Authorization: Bearer secret-key'), false);
  assert.equal(text.includes('[redacted]'), true);
});

test('passes AbortSignal to upstream fetch', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  let signal;
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'test-key' },
    fetchImpl: async (_url, init) => {
      signal = init.signal;
      return sseResponse(['data: {}\n\n']);
    },
  });
  assert.ok(signal instanceof AbortSignal);
});

test('request cancellation returns aborted response before streaming starts', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'test-key' },
    fetchImpl: async (_url, init) => {
      req.emit('aborted');
      assert.equal(init.signal.aborted, true);
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    },
  });
  assert.equal(res.statusCode, 499);
  assert.equal(res.json().error.code, 'REQUEST_ABORTED');
});
