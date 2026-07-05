const { DifySseParser } = require('./sse_parser');
const { NdjsonEventParser } = require('./ndjson_event_parser');
const {
  createInitialChatState,
  reduceChatEvent,
  setConversationId,
} = require('./chat_event_state');

class ChatStreamError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ChatStreamError';
    this.code = details.code || 'CHAT_STREAM_ERROR';
    this.details = details;
  }
}

function validateStreamChatOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new ChatStreamError('streamChat options must be an object', { code: 'INVALID_OPTIONS' });
  }
  if (typeof options.query !== 'string' || options.query.trim() === '') {
    throw new ChatStreamError('query is required', { code: 'INVALID_QUERY' });
  }
  if (options.conversationId !== undefined && typeof options.conversationId !== 'string') {
    throw new ChatStreamError('conversationId must be a string', { code: 'INVALID_CONVERSATION_ID' });
  }
  if (options.user !== undefined && typeof options.user !== 'string') {
    throw new ChatStreamError('user must be a string', { code: 'INVALID_USER' });
  }
  if (options.inputs !== undefined && (!options.inputs || typeof options.inputs !== 'object' || Array.isArray(options.inputs))) {
    throw new ChatStreamError('inputs must be an object', { code: 'INVALID_INPUTS' });
  }
}

function appendProtocolError(state, error, fallbackCode) {
  return {
    ...state,
    streamStatus: 'error',
    protocolErrors: [
      ...state.protocolErrors,
      {
        code: error.code || fallbackCode,
        message: error.message,
        details: error.details || {},
      },
    ],
  };
}

function emitState(callback, state) {
  if (typeof callback === 'function') callback(state);
}

function emitCallback(callback, value) {
  if (typeof callback === 'function') callback(value);
}

async function readErrorBody(response) {
  try {
    return await response.text();
  } catch (_error) {
    return '';
  }
}

async function streamChat(options) {
  validateStreamChatOptions(options);

  const fetchImpl = options.fetchImpl || fetch;
  const endpoint = options.endpoint || '/api/chat';
  const sseParser = options.sseParser || new DifySseParser();
  const ndjsonParser = options.ndjsonParser || new NdjsonEventParser();
  const stateRef = { current: createInitialChatState() };
  stateRef.current.streamStatus = 'streaming';
  emitState(options.onStateChange, stateRef.current);

  const requestBody = {
    query: options.query,
    conversation_id: options.conversationId || '',
    user: options.user || 'travel-stay-agent-browser-user',
    inputs: options.inputs || {},
  };

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      stateRef.current = appendProtocolError(stateRef.current, new ChatStreamError('request was aborted', {
        code: 'REQUEST_ABORTED',
      }), 'REQUEST_ABORTED');
      emitState(options.onStateChange, stateRef.current);
      return stateRef.current;
    }
    throw new ChatStreamError('failed to call /api/chat', {
      code: 'FETCH_FAILED',
      cause: error?.message,
    });
  }

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ChatStreamError(`/api/chat returned HTTP ${response.status}`, {
      code: 'HTTP_ERROR',
      status: response.status,
      body: body.slice(0, 500),
    });
  }

  if (!response.body) {
    throw new ChatStreamError('/api/chat response body is empty', { code: 'EMPTY_RESPONSE_BODY' });
  }

  const dispatchBusinessEvent = (event) => {
    stateRef.current = reduceChatEvent(stateRef.current, event);
    emitCallback(options.onBusinessEvent, event);
    emitState(options.onStateChange, stateRef.current);
  };

  const dispatchDifyEvent = (difyEvent) => {
    if (typeof difyEvent.conversation_id === 'string' && difyEvent.conversation_id) {
      if (stateRef.current.conversationId !== difyEvent.conversation_id) {
        stateRef.current = setConversationId(stateRef.current, difyEvent.conversation_id);
        emitCallback(options.onConversationId, difyEvent.conversation_id);
        emitState(options.onStateChange, stateRef.current);
      }
    }

    if (difyEvent.event === 'error' || difyEvent.error) {
      const message = typeof difyEvent.message === 'string'
        ? difyEvent.message
        : 'Dify transport event reported an error';
      stateRef.current = appendProtocolError(stateRef.current, new ChatStreamError(message, {
        code: 'DIFY_TRANSPORT_ERROR',
      }), 'DIFY_TRANSPORT_ERROR');
      emitCallback(options.onError, stateRef.current.protocolErrors.at(-1));
      emitState(options.onStateChange, stateRef.current);
      return;
    }

    if (typeof difyEvent.answer !== 'string') return;

    const businessEvents = ndjsonParser.push(difyEvent.answer);
    for (const event of businessEvents) dispatchBusinessEvent(event);
  };

  try {
    const reader = response.body.getReader();
    try {
      while (true) {
        if (options.signal?.aborted) {
          await reader.cancel();
          stateRef.current = appendProtocolError(stateRef.current, new ChatStreamError('request was aborted', {
            code: 'REQUEST_ABORTED',
          }), 'REQUEST_ABORTED');
          emitState(options.onStateChange, stateRef.current);
          return stateRef.current;
        }

        const { done, value } = await reader.read();
        if (done) break;
        const difyEvents = sseParser.push(value);
        for (const difyEvent of difyEvents) dispatchDifyEvent(difyEvent);
      }
    } finally {
      reader.releaseLock();
    }

    for (const difyEvent of sseParser.end()) dispatchDifyEvent(difyEvent);
    for (const event of ndjsonParser.end()) dispatchBusinessEvent(event);
    return stateRef.current;
  } catch (error) {
    if (error?.name === 'AbortError') {
      stateRef.current = appendProtocolError(stateRef.current, new ChatStreamError('request was aborted', {
        code: 'REQUEST_ABORTED',
      }), 'REQUEST_ABORTED');
    } else {
      stateRef.current = appendProtocolError(stateRef.current, error, error.code || 'STREAM_PROTOCOL_ERROR');
    }
    emitCallback(options.onError, stateRef.current.protocolErrors.at(-1));
    emitState(options.onStateChange, stateRef.current);
    return stateRef.current;
  }
}

module.exports = {
  ChatStreamError,
  streamChat,
  validateStreamChatOptions,
};
