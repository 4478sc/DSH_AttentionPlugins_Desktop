/**
 * Typert host manifest for dsh-attention-toast.
 *
 * The loader discovers `exports["./typert"]`, validates this manifest and
 * registers the invocations; the browser half mounts the matching descriptors
 * with `ctx.remote.$mount(...)` and then calls `remote.attentionToast.*`.
 */
import { z } from 'zod'

const colorSchema = z.object({
  bg: z.string(),
  fg: z.string(),
  accent: z.string(),
})

const configSchema = z.object({
  locale: z.enum(['zh', 'en']),
  width: z.number(),
  durationMs: z.number(),
  maxVisible: z.number(),
  colors: z.object({
    completed: colorSchema,
    failed: colorSchema,
    question: colorSchema,
    permission: colorSchema,
    sidelinedone: colorSchema,
  }),
})

const stateSchema = z.object({
  config: configSchema,
  hostAlive: z.boolean(),
  desktop: z.boolean(),
  lastError: z.string().nullable(),
})

const patchSchema = z.record(z.string(), z.unknown())

const toastTargetSchema = z.enum(['session', 'approval', 'question', 'summary'])

const showSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(['completed', 'failed', 'question', 'permission', 'sidelinedone']),
  title: z.string(),
  text: z.string().optional(),
  durationMs: z.number().optional(),
  // Navigation metadata (issue #1): never parse title/text to find a session.
  sessionId: z.string().optional(),
  target: toastTargetSchema.optional(),
  sessionIds: z.array(z.string()).optional(),
  interactionKey: z.string().optional(),
})

const ackSchema = z.object({ ok: z.boolean() })

const approvalSchema = z.object({
  seq: z.number(),
  ts: z.string(),
  tool: z.string(),
  risk: z.string(),
  decision: z.string(),
  kind: z.string(),
  reason: z.string(),
  sessionId: z.string().nullable(),
})

const pendingApprovalSchema = z.object({
  seq: z.number(),
  ts: z.string(),
  tool: z.string(),
  reason: z.string(),
  risk: z.string(),
  sessionId: z.string().nullable(),
})

const approvalStatsSchema = z.object({
  total: z.number(),
  high: z.number(),
  rejected: z.number(),
})

const approvalsSchema = z.object({
  seq: z.number(),
  exists: z.boolean(),
  file: z.string(),
  items: z.array(approvalSchema),
  stats: approvalStatsSchema,
  pendingSeq: z.number(),
  pending: z.array(pendingApprovalSchema),
})

const strictCodec = (typeSymbol, schema) => ({
  mode: 'strict',
  typeSymbol,
  schema,
  create: () => schema,
})

const stateCodec = strictCodec('dsh-attention-toast#ToastState', stateSchema)
const configCodec = strictCodec('dsh-attention-toast#ToastConfig', configSchema)
const patchCodec = strictCodec('dsh-attention-toast#ToastConfigPatch', patchSchema)
const showCodec = strictCodec('dsh-attention-toast#ToastPayload', showSchema)
const ackCodec = strictCodec('dsh-attention-toast#ToastAck', ackSchema)
const approvalsCodec = strictCodec('dsh-attention-toast#ApprovalList', approvalsSchema)

const invocation = (method, parameters, result) => ({
  id: 'dsh-attention-toast#attentionToast/' + method,
  service: 'attentionToast',
  namespace: 'attentionToast',
  method,
  invocation: { kind: 'direct' },
  parameters,
  result,
})

export const TYPERT = {
  package: 'dsh-attention-toast',
  face: 'host',
  schemas: [],
  invocations: [
    invocation('getState', [], stateCodec),
    invocation('updateConfig', [{ name: 'patch', wire: 'patch', source: 'json', codec: patchCodec }], configCodec),
    invocation('show', [{ name: 'payload', wire: 'payload', source: 'json', codec: showCodec }], ackCodec),
    invocation('preview', [], ackCodec),
    invocation('getApprovals', [{ name: 'sinceSeq', wire: 'sinceSeq', source: 'json', codec: strictCodec('dsh-attention-toast#Seq', z.number()) }, { name: 'pendingSince', wire: 'pendingSince', source: 'json', codec: strictCodec('dsh-attention-toast#PendingSeq', z.number()) }], approvalsCodec),
    invocation('closeAll', [], ackCodec),
    invocation('restartHost', [], ackCodec),
  ],
  model: {
    services: [{
      description: 'dsh-attention-toast desktop toast service (config + show).',
      summary: 'dsh-attention-toast desktop toast service.',
      tags: [],
      jsDoc: '/** dsh-attention-toast desktop toast service. */',
      key: 'attentionToast',
      exportName: 'AttentionToastService',
      members: [
        { kind: 'method', name: 'getState', signature: 'getState(): ToastState', summary: 'Read toast config and host health.' },
        { kind: 'method', name: 'updateConfig', signature: 'updateConfig(patch: ToastConfigPatch): ToastConfig', summary: 'Deep-merge toast appearance settings.' },
        { kind: 'method', name: 'show', signature: 'show(payload: ToastPayload): ToastAck', summary: 'Show one desktop toast and remember its session/target metadata.' },
        { kind: 'method', name: 'preview', signature: 'preview(): ToastAck', summary: 'Show sample toasts.' },
        { kind: 'method', name: 'getApprovals', signature: 'getApprovals(sinceSeq: number, pendingSince: number): ApprovalList', summary: 'New decided approvals from the optional approval-ledger file.' },
        { kind: 'method', name: 'closeAll', signature: 'closeAll(): ToastAck', summary: 'Dismiss every toast.' },
        { kind: 'method', name: 'restartHost', signature: 'restartHost(): ToastAck', summary: 'Restart the toast host process.' },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
}

export default TYPERT
