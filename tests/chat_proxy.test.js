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

test('upstream non-2xx returns upstream error without leaking credentials', async () => {
  const req = new MockReq({ query: 'hello' });
  const res = new MockRes();
  await handleChatRequest(req, res, {
    env: { DIFY_API_KEY: 'secret-key', DIFY_API_BASE_URL: 'https://dify.test/v1' },
    fetchImpl: async () => ({ ok: false, status: 401, headers: new Headers(), body: null }),
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, 'UPSTREAM_ERROR');
  assert.equal(res.text().includes('secret-key'), false);
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
