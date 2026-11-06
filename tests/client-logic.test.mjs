import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// The browser bundle wraps itself in window.__ModuleLoader__.load(); stub the
// loader and a minimal React so the factory can be evaluated in Node.
let captured = null
globalThis.window = {
  __ModuleLoader__: { load: (mod) => { captured = mod } },
}
globalThis.document = { hidden: false, hasFocus: () => true }
const reactStub = {
  createElement: (type, props, ...kids) => ({ type: typeof type === 'function' ? (type.name || 'fn') : type, props: props || {}, kids }),
  useSyncExternalStore: (sub, get) => get(),
  useEffect: () => {},
  useState: () => [null, () => {}],
  useCallback: (fn) => fn,
  useRef: () => ({ current: null }),
  Fragment: 'Fragment',
}

await import(pathToFileURL(resolve('lib/client.js')).href + '?t=' + Date.now())
assert.ok(captured, 'client bundle must call __ModuleLoader__.load')
const plugin = captured.factory((name) => {
  if (name === 'react') return reactStub
  throw new Error('unexpected require: ' + name)
})
const api = plugin.__test
assert.ok(api, 'client must expose __test hooks')

test('migrates the old taskMode + sidelineMode pair', () => {
  assert.equal(api.normalizeSettings({ taskMode: 'mainline', sidelineMode: 'per-session' }).mainlineMode, 'balanced')
  assert.equal(api.normalizeSettings({ taskMode: 'mainline', sidelineMode: 'batch' }).mainlineMode, 'mainline')
  assert.equal(api.normalizeSettings({ taskMode: 'balanced', sidelineMode: 'batch' }).mainlineMode, 'balanced')
  assert.equal(api.normalizeSettings({ mainlineMode: 'silent' }).mainlineMode, 'silent')
  assert.equal(api.normalizeSettings({}).mainlineMode, 'mainline')
})

test('migrates notifyCurrent into currentSessionMode', () => {
  assert.equal(api.normalizeSettings({ notifyCurrent: true }).currentSessionMode, 'always')
  assert.equal(api.normalizeSettings({ notifyCurrent: false }).currentSessionMode, 'hidden')
  assert.equal(api.normalizeSettings({ currentSessionMode: 'unfocused' }).currentSessionMode, 'unfocused')
  assert.equal(api.normalizeSettings({ currentSessionMode: 'bogus' }).currentSessionMode, 'hidden')
})

test('sanitizes muted sessions and defaults waitForSubagents on', () => {
  const s = api.normalizeSettings({ mutedSessionIds: ['a', '', 3, 'b'] })
  assert.deepEqual(s.mutedSessionIds, ['a', 'b'])
  assert.equal(s.waitForSubagents, true)
  assert.equal(api.normalizeSettings({ waitForSubagents: false }).waitForSubagents, false)
})

test('decideAlert honours mode, marker and mute', () => {
  assert.equal(api.decideAlert('completed', 'mainline', false, false), 'aggregate')
  assert.equal(api.decideAlert('completed', 'mainline', true, false), 'alert')
  assert.equal(api.decideAlert('failed', 'mainline', false, false), 'aggregate')
  assert.equal(api.decideAlert('completed', 'balanced', false, false), 'alert')
  assert.equal(api.decideAlert('completed', 'silent', true, false), 'never')
  assert.equal(api.decideAlert('question', 'silent', false, false), 'alert')
  assert.equal(api.decideAlert('permission', 'silent', true, false), 'alert')
  assert.equal(api.decideAlert('completed', 'balanced', true, true), 'never')
  assert.equal(api.decideAlert('question', 'balanced', true, true), 'never')
})

test('shouldAlertCurrentSession covers the three tiers', () => {
  assert.equal(api.shouldAlertCurrentSession('hidden', { hidden: false, focused: true }), false)
  assert.equal(api.shouldAlertCurrentSession('hidden', { hidden: true, focused: false }), true)
  assert.equal(api.shouldAlertCurrentSession('unfocused', { hidden: false, focused: false }), true)
  assert.equal(api.shouldAlertCurrentSession('unfocused', { hidden: false, focused: true }), false)
  assert.equal(api.shouldAlertCurrentSession('always', { hidden: false, focused: true }), true)
})

test('countRunningChildren only counts running direct children', () => {
  const rows = [
    { parentSessionId: 'p', running: true },
    { parentSessionId: 'p', running: false },
    { parentSessionId: 'q', running: true },
  ]
  assert.equal(api.countRunningChildren('p', rows), 1)
  assert.equal(api.countRunningChildren('z', rows), 0)
})

test('settings section renders every block (root div stays open)', () => {
  const tree = api.SettingsSection()
  assert.equal(tree.props.className, 'att-root')
  const blocks = tree.kids.map((k) => (k && k.props ? k.props.className : ''))
  assert.deepEqual(blocks, ['att-hero', 'att-block', 'att-block', 'att-block', 'att-block', 'att-block', 'att-foot'])
  const eventsBlock = tree.kids[3]
  assert.equal(eventsBlock.kids.length, 2)
  assert.ok(Array.isArray(eventsBlock.kids[1]), 'events block renders one row per event type')
  assert.equal(eventsBlock.kids[1].length, 4)
  const lookBlock = tree.kids[4]
  assert.equal(lookBlock.kids.length, 4, 'appearance block: title + duration + max + current session')
})

test('predictRisk flags dangerous approval text and stays advisory for the rest', () => {
  assert.equal(api.predictRisk('escalate sandbox to danger-full-access: 验证'), 'high')
  assert.equal(api.predictRisk('bash: rm -rf build/'), 'high')
  assert.equal(api.predictRisk('chmod 777 /tmp/x'), 'high')
  assert.equal(api.predictRisk('删除 build 目录'), 'medium')
  assert.equal(api.predictRisk('list files'), 'low')
  assert.equal(api.predictRisk('   '), 'unknown')
})
