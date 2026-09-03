# Chat Client Stream Protocol

This document describes the browser-side protocol layer used by the current static interface.

The parsers and state reducer are framework-neutral CommonJS modules. `lib/client/chat_ui_app.js` connects them to the browser UI, and `scripts/build_client_bundle.js` packages the client modules into `app.bundle.js`.

## Two Protocol Layers

There are two separate streaming protocols:

1. Dify SSE transport
2. Project business NDJSON

Network chunks, SSE frames, Dify `answer` deltas, and NDJSON lines do not share boundaries.

The browser must first parse Dify SSE frames, then append each string `answer` delta into an NDJSON line buffer.

## Modules

```text
lib/client/sse_parser.js
lib/client/ndjson_event_parser.js
lib/client/chat_event_state.js
lib/client/chat_stream_client.js
```

- `sse_parser.js`: converts UTF-8 byte chunks or text chunks into Dify event objects.
- `ndjson_event_parser.js`: converts Dify `answer` text deltas into complete business events.
- `chat_event_state.js`: applies business events to a framework-neutral state object.
- `chat_stream_client.js`: calls `/api/chat`, reads the streamed response, connects both parsers, and emits state/event callbacks.

## Dify SSE Layer

The SSE parser:

- uses streaming `TextDecoder`;
- supports network chunk fragmentation;
- supports one chunk containing multiple SSE frames;
- supports LF and CRLF;
- uses blank lines as SSE frame boundaries;
- collects `data:` lines;
- ignores comments and heartbeat lines;
- parses JSON data into Dify event objects;
- reports malformed SSE data as a protocol error.

Only Dify events with a string `answer` are sent into the NDJSON parser. Dify events without `answer` may still update `conversation_id`.

## Business NDJSON Layer

The NDJSON parser:

- keeps a line buffer across answer deltas;
- parses only complete non-empty lines;
- supports one line split across many answer deltas;
- supports one answer delta containing many lines;
- reports malformed complete JSON lines;
- reports truncated non-empty residual text when the transport stream ends.

Dify transport end is not the same as the business `done` event.

## Supported Business Event Types

- `fact_frame`
- `primary_recommendation`
- `recommendation_reason`
- `alternative_recommendation`
- `route_advice`
- `weather_advice`
- `data_notice`
- `no_candidate`
- `unsupported_city`
- `invalid_trip_date`
- `clarification_required`
- `done`

Unknown future event types do not crash the client. They are recorded in `protocolErrors` and the stream can continue.

## State Shape

```json
{
  "streamStatus": "idle | streaming | done | error",
  "responseMode": "normal | no_candidate | unsupported_city | invalid_trip_date | clarification_required | null",
  "conversationId": "",
  "awaitingUserInput": false,
  "factFrame": null,
  "primaryRecommendation": null,
  "recommendationReasons": [],
  "alternativeRecommendations": [],
  "routeAdvice": null,
  "weatherAdvice": null,
  "dataNotice": null,
  "noCandidate": null,
  "unsupportedCity": null,
  "invalidTripDate": null,
  "clarification": null,
  "protocolErrors": []
}
```

`clarification_required` sets `awaitingUserInput` from `payload.awaiting_user_input`. A later `done` event marks the current response stream complete but does not clear `awaitingUserInput`.

## Current UI Integration

The current UI calls:

```js
streamChat({
  query,
  conversationId,
  user,
  inputs,
  signal,
  onStateChange,
  onBusinessEvent,
  onConversationId,
  onError,
});
```

The client calls only local `/api/chat`. It does not read or expose `DIFY_API_KEY`, and it does not call Dify directly.

## Conversation ID

When a Dify SSE event includes a non-empty `conversation_id`, `streamChat` stores it in state and calls `onConversationId`. The browser should pass that ID back as `conversation_id` on later turns.

## Runtime Boundaries

- The browser validates event shapes but does not generate recommendations or repair semantically incorrect workflow output.
- The Dify Chatflow owns clarification, retrieval, tool calls, evidence assembly, and business-event generation.
- The client does not repair out-of-catalog place IDs or Dify conversation-variable type mismatches; those are workflow/runtime concerns.
- The interface is static, framework-free JavaScript rather than React.
- The browser retains only a lightweight user ID and the current Dify `conversation_id`; it does not provide accounts or durable cross-device history.
