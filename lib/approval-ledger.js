/**
 * Read-only view over @deepwhale-cn/dsh-approval-ledger's JSONL file.
 *
 * We never import that plugin: if it is installed it appends one JSON object per
 * decided approval to `$DSH_HOME/approval-ledger/ledger.jsonl`, and this module
 * turns new lines into the small records the toast client understands. When the
 * file is missing every function degrades to an empty result.
 */

const DECISION_LABELS = {
  'allowed-once': 'approved',
  allow: 'approved',
  allowed: 'approved',
  approved: 'approved',
  'auto-allow': 'approved',
  rejected: 'rejected',
  'auto-deny': 'rejected',
  deny: 'rejected',
  denied: 'rejected',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  unavailable: 'other',
}

/** Map a ledger decision/result string onto approved / rejected / cancelled / other. */
export function decisionKind(value) {
  const key = String(value ?? '').trim().toLowerCase()
  return DECISION_LABELS[key] ?? (key === '' ? 'other' : 'other')
}

/** Tolerant projection of one ledger line; returns null for unusable rows. */
export function normalizeRecord(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const ts = typeof raw.ts === 'string' ? raw.ts : typeof raw.time === 'string' ? raw.time : ''
  const tool = String(raw.tool ?? raw.toolName ?? '')
  const risk = String(raw.risk ?? raw.riskLevel ?? 'unknown').toLowerCase()
  const decisionRaw = raw.decision ?? raw.result ?? raw.outcome ?? ''
  const reason = String(raw.reason ?? raw.detail ?? '')
  const sessionId = raw.sessionId ?? raw.session ?? null
  if (ts === '' && tool === '' && String(decisionRaw) === '') return null
  return {
    ts,
    tool,
    risk,
    decision: String(decisionRaw),
    kind: decisionKind(decisionRaw),
    reason: reason.slice(0, 240),
    sessionId: typeof sessionId === 'string' ? sessionId : null,
  }
}

/** Parse a chunk of JSONL into normalized records (bad lines are skipped). */
export function parseChunk(text) {
  const out = []
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let parsed
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    const record = normalizeRecord(parsed)
    if (record !== null) out.push(record)
  }
  return out
}
