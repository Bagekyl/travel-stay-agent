class SseParseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SseParseError';
    this.code = 'MALFORMED_SSE_DATA';
    this.details = details;
  }
}

function stripSingleLeadingSpace(value) {
  return value.startsWith(' ') ? value.slice(1) : value;
}

function findFrameBoundary(buffer) {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match) return null;
  return {
    index: match.index,
    length: match[0].length,
  };
}

function parseSseFrame(frame) {
  const dataLines = [];
  const lines = frame.split(/\r?\n/);

  for (const line of lines) {
    if (line === '' || line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      dataLines.push(stripSingleLeadingSpace(line.slice(5)));
    }
  }

  if (dataLines.length === 0) return [];

  const data = dataLines.join('\n');
  if (data.trim() === '[DONE]') {
    return [{ event: 'dify_done' }];
  }

  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SseParseError('Dify SSE data must be a JSON object', { data });
    }
    return [parsed];
  } catch (error) {
    if (error instanceof SseParseError) throw error;
    throw new SseParseError('Dify SSE data is not valid JSON', { data });
  }
}

class DifySseParser {
  constructor() {
    this.decoder = new TextDecoder();
    this.buffer = '';
  }

  push(chunk) {
    const text = typeof chunk === 'string'
      ? chunk
      : this.decoder.decode(chunk, { stream: true });
    this.buffer += text;

    const events = [];
    while (true) {
      const boundary = findFrameBoundary(this.buffer);
      if (!boundary) break;

      const frame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary.length);
      if (frame.trim() === '') continue;
      events.push(...parseSseFrame(frame));
    }
    return events;
  }

  end() {
    const text = this.decoder.decode();
    if (text) this.buffer += text;
    if (this.buffer.trim() === '') {
      this.buffer = '';
      return [];
    }

    const trailingFrame = this.buffer;
    this.buffer = '';
    return parseSseFrame(trailingFrame);
  }
}

module.exports = {
  DifySseParser,
  SseParseError,
  parseSseFrame,
};
