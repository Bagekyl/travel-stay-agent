# Dify Chatflow Setup

The versioned workflow export is stored at:

```text
dify/travelstay-chatflow.yml
```

It is a Dify `advanced-chat` application export using DSL version `0.7.0`. A static audit found 39 nodes and 44 edges, with all nodes reachable from the start node. A clean import into a second Dify workspace was not performed during the release audit.

The export's internal Dify application name is `旅游决策`. The repository-facing project name is `旅策 / TravelStay Agent`; these names refer to the same project.

## Import

1. In Dify, create an application by importing `dify/travelstay-chatflow.yml`.
2. Review the imported nodes before publishing. Dify provider, dataset, and credential bindings are workspace-specific and may not transfer automatically.
3. Configure the Google Gemini provider used by the three LLM nodes. The export references `gemini-3.5-flash`; model availability depends on the connected provider and Dify version. Any model substitution should be revalidated.
4. Create or select a Dify knowledge base, upload the eight Markdown files in `knowledge_base/`, and bind it to the `住宿决策知识检索` node. The dataset identifier in an export belongs to the source Dify workspace.
5. Add `GOOGLE_MAPS_API_KEY` as a secret environment variable in the Chatflow. It is used by the `Google Routes 路线矩阵获取` node and must never be placed in browser code or committed files.

## HTTP Nodes

The workflow contains four HTTP request nodes:

| Node | Purpose | Credential |
| --- | --- | --- |
| `关键地点目录获取` | Calls `POST /api/places/search` | None |
| `海口天气预报获取` | Calls Open-Meteo forecast API | None |
| `候选酒店搜索` | Calls `POST /api/hotels/search` | None |
| `Google Routes 路线矩阵获取` | Calls Google Routes matrix API | `GOOGLE_MAPS_API_KEY` |

The exported Mock API URLs are the endpoints used by the audited prototype and were reachable on 2026-09-03. They are not a guaranteed public service. After deploying a fork, update the two Mock API nodes to that deployment's HTTPS origin while preserving the paths above.

All four HTTP nodes enable retries, but the export does not define explicit Dify node error strategies. The existing weather and route branches cover date-coverage and route-input conditions; they should not be described as verified fallbacks for every upstream HTTP failure.

Google Places API is not called by the runtime Chatflow. It is used only by the offline scripts under `scripts/data_prep/` to prepare Place IDs and coordinates.

## Publish And Connect The Proxy

1. Publish the imported Chatflow in Dify.
2. Create a Dify application API key.
3. Configure the Vercel project with server-only `DIFY_API_KEY` and, if required, `DIFY_API_BASE_URL`.
4. Do not expose the Dify key through client-prefixed environment variables or browser JavaScript.
5. Open the static interface and submit a request. The browser calls only local `POST /api/chat`; the Vercel function calls Dify.

## Expected Stream Contract

Dify returns an SSE stream. Incremental `answer` text contains newline-delimited JSON business events. The workflow can emit:

```text
fact_frame
primary_recommendation
recommendation_reason
alternative_recommendation
route_advice
weather_advice
data_notice
no_candidate
unsupported_city
invalid_trip_date
clarification_required
done
```

The browser first parses Dify SSE, then parses NDJSON from the `answer` deltas. See `docs/chat_client_protocol.md` for the event and state contract.

## Import Verification Checklist

- The start node reaches all 39 nodes.
- The knowledge retrieval node has a valid dataset binding.
- All three LLM nodes have an available provider credential.
- `GOOGLE_MAPS_API_KEY` is configured as a Dify secret.
- Both Mock API nodes point to the deployment being tested.
- Date ranges outside forecast coverage and route inputs that cannot form a matrix follow their existing branches.
- Test upstream HTTP failure behavior separately; do not assume it degrades gracefully.
- Verify that numeric `number` outputs can be assigned to `integer` conversation variables in the target Dify version.
- Confirm that selected place IDs exist in the returned catalog; the current graph records invalid IDs but does not retry the selection node.
- An incomplete request returns `clarification_required` and preserves `conversation_id`.
- A complete request ends with a valid `done` event.
