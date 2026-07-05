class NdjsonProtocolError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'NdjsonProtocolError';
    this.code = details.code || 'NDJSON_PROTOCOL_ERROR';
    this.details = details;
  }
}

function validateBusinessEvent(event, rawLine) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new NdjsonProtocolError('business event must be a JSON object', {
      code: 'INVALID_BUSINESS_EVENT',
      rawLine,
    });
  }
  if (typeof event.type !== 'string' || event.type.trim() === '') {
    throw new NdjsonProtocolError('business event type must be a non-empty string', {
      code: 'INVALID_EVENT_TYPE',
      rawLine,
    });
  }
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    throw new NdjsonProtocolError('business event payload must be an object', {
      code: 'INVALID_EVENT_PAYLOAD',
      eventType: event.type,
      rawLine,
    });
  }
  return event;
}

function parseCompleteLine(trimmed) {
  try {
    return validateBusinessEvent(JSON.parse(trimmed), trimmed);
  } catch (error) {
    if (error instanceof NdjsonProtocolError) throw error;
    throw new NdjsonProtocolError('business NDJSON line is not valid JSON', {
      code: 'MALFORMED_NDJSON_LINE',
      rawLine: trimmed,
    });
  }
}

class NdjsonEventParser {
  constructor() {
    this.lineBuffer = '';
  }

  push(delta) {
    if (typeof delta !== 'string') {
      throw new NdjsonProtocolError('answer delta must be a string', {
        code: 'INVALID_ANSWER_DELTA',
      });
    }

    this.lineBuffer += delta;
    const normalized = this.lineBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    this.lineBuffer = lines.pop() || '';

    const events = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      events.push(parseCompleteLine(trimmed));
    }
    return events;
  }

  end() {
    const remainder = this.lineBuffer;
    const trimmed = remainder.trim();
    this.lineBuffer = '';

    if (trimmed === '') {
      return [];
    }

    try {
      return [validateBusinessEvent(JSON.parse(trimmed), trimmed)];
    } catch (error) {
      if (error instanceof NdjsonProtocolError) throw error;
      throw new NdjsonProtocolError('stream ended with incomplete NDJSON line', {
        code: 'TRUNCATED_NDJSON',
        remainder,
      });
    }
  }
}

module.exports = {
  NdjsonEventParser,
  NdjsonProtocolError,
  validateBusinessEvent,
};
