import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRecord, parseChunk, decisionKind } from '../lib/approval-ledger.js'

test('decisionKind maps the four DSH approval outcomes', () => {
  assert.equal(decisionKind('allowed-once'), 'approved')
  assert.equal(decisionKind('rejected'), 'rejected')
  assert.equal(decisionKind('auto-deny'), 'rejected')
  assert.equal(decisionKind('cancelled'), 'cancelled')
  assert.equal(decisionKind('unavailable'), 'other')
  assert.equal(decisionKind(undefined), 'other')
})

test('normalizeRecord is tolerant about field names and shape', () => {
  const rec = normalizeRecord({
    ts: '2026-11-06T12:00:00.000Z',
    tool: 'bash',
    risk: 'HIGH',
    decision: 'rejected',
    reason: 'rm -rf build/',
    sessionId: 's1',
  })
  assert.deepEqual(rec, {
    ts: '2026-11-06T12:00:00.000Z',
    tool: 'bash',
    risk: 'high',
    decision: 'rejected',
    kind: 'rejected',
    reason: 'rm -rf build/',
    sessionId: 's1',
  })
  const alt = normalizeRecord({ time: 'x', toolName: 'pwsh', result: 'allowed-once', detail: 'ok' })
  assert.equal(alt.tool, 'pwsh')
  assert.equal(alt.kind, 'approved')
  assert.equal(alt.risk, 'unknown')
  assert.equal(normalizeRecord(null), null)
  assert.equal(normalizeRecord({}), null)
})

test('delegated decisions are classified by outcome, not by the decision string', () => {
  const approved = normalizeRecord({ ts: 'x', tool: 'pwsh', decision: 'delegated', outcome: 'allowed-once' })
  assert.equal(approved.kind, 'approved')
  assert.equal(approved.decision, 'delegated')
  const denied = normalizeRecord({ ts: 'x', tool: 'bash', decision: 'auto-deny', outcome: 'rejected' })
  assert.equal(denied.kind, 'rejected')
  const auto = normalizeRecord({ ts: 'x', tool: 'read', decision: 'auto-allow' })
  assert.equal(auto.kind, 'approved')
})

test('parseChunk skips malformed lines and keeps good ones', () => {
  const text = [
    '{"ts":"a","tool":"bash","risk":"low","decision":"allowed-once"}',
    'not json',
    '',
    '{"ts":"b","tool":"fs","risk":"medium","decision":"rejected"}',
  ].join('\n')
  const out = parseChunk(text)
  assert.equal(out.length, 2)
  assert.deepEqual(out.map((r) => r.kind), ['approved', 'rejected'])
  assert.deepEqual(parseChunk(''), [])
})
