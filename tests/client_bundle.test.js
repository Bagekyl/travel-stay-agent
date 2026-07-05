const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const {
  buildBundle,
  discoverClientModules,
  localRequireRequests,
} = require('../scripts/build_client_bundle');

test('client bundle discovers chat_scroll_state dependency from chat_ui_app', () => {
  const { modules, dependencyMap } = discoverClientModules();

  assert.ok(modules.includes('lib/client/chat_scroll_state.js'));
  assert.equal(
    dependencyMap['lib/client/chat_ui_app.js']['./chat_scroll_state'],
    'lib/client/chat_scroll_state.js',
  );
});

test('all discovered client module dependencies are mapped to bundled modules', () => {
  const { modules, dependencyMap } = discoverClientModules();
  const moduleSet = new Set(modules);

  for (const [filename, deps] of Object.entries(dependencyMap)) {
    assert.ok(moduleSet.has(filename), `${filename} should be bundled`);
    for (const [request, mapped] of Object.entries(deps)) {
      assert.ok(moduleSet.has(mapped), `${request} from ${filename} should map to bundled module ${mapped}`);
    }
  }
});

test('local require scanner sees existing client require calls', () => {
  const source = [
    "const a = require('./chat_stream_client');",
    "const b = require(\"./chat_scroll_state\");",
  ].join('\n');

  assert.deepEqual(localRequireRequests(source), ['./chat_stream_client', './chat_scroll_state']);
});

test('generated browser bundle initializes entry module without missing dependency', () => {
  const bundle = buildBundle();
  const context = {
    console,
    URLSearchParams,
    window: { location: { search: '' } },
    document: { querySelector: () => null },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    crypto: { randomUUID: () => 'test-user-id' },
    TextDecoder,
    TextEncoder,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(bundle, context);

  assert.equal(typeof context.window.TravelStayAgentApp.initTravelStayApp, 'function');
  assert.equal(context.window.TravelStayAgentApp.initTravelStayApp('#missing'), null);
  assert.equal(bundle.includes('Dependency not mapped: ./chat_scroll_state'), false);
});
