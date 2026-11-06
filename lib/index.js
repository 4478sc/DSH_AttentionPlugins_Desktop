/**
 * dsh-attention-toast — host half.
 *
 * Owns the Linux desktop toast process (GTK3 / XWayland, bottom-right stack)
 * and exposes it to the browser half through a Typert service named
 * `attentionToast`.
 *
 * The browser half decides *what* to show (main-line / side-line gating,
 * event switches); this half decides *how* it looks (colors, duration, stack).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { parseChunk } from './approval-ledger.js'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-attention-toast'
export const inject = []

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'toast_host.py')
const SCRIPT_WIN = join(HERE, 'toast_host.ps1')
const IS_WIN = process.platform === 'win32'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const CONFIG_PATH = join(DSH_HOME, 'storages', 'dsh-attention-toast', 'config.json')

const DEFAULT_CONFIG = {
  locale: 'zh',
  width: 340,
  durationMs: 8000,
  maxVisible: 3,
  colors: {
    completed: { bg: '#12351f', fg: '#e6f4ea', accent: '#2ea043' },
    failed: { bg: '#3a1518', fg: '#fbe9ea', accent: '#d1242f' },
    question: { bg: '#241a3d', fg: '#efe9ff', accent: '#8250df' },
    permission: { bg: '#3a2a10', fg: '#fff4e0', accent: '#bf8700' },
    sidelinedone: { bg: '#0d2a33', fg: '#e3f6fb', accent: '#1f8fb0' },
  },
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Deep-merge a patch into the current config, keeping schema-known keys only. */
function mergeConfig(base, patch) {
  const next = clone(base)
  if (patch === null || typeof patch !== 'object') return next
  for (const key of ['locale', 'width', 'durationMs', 'maxVisible']) {
    if (patch[key] !== undefined && patch[key] !== null) next[key] = patch[key]
  }
  const colors = patch.colors
  if (colors !== null && typeof colors === 'object') {
    for (const kind of Object.keys(next.colors)) {
      const entry = colors[kind]
      if (entry === null || typeof entry !== 'object') continue
      for (const field of ['bg', 'fg', 'accent']) {
        if (typeof entry[field] === 'string' && entry[field].length > 0) next.colors[kind][field] = entry[field]
      }
    }
  }
  next.width = Math.min(520, Math.max(260, Number(next.width) || 340))
  next.durationMs = Math.min(60000, Math.max(2000, Number(next.durationMs) || 8000))
  next.maxVisible = Math.min(6, Math.max(1, Number(next.maxVisible) || 3))
  if (next.locale !== 'zh' && next.locale !== 'en') next.locale = 'zh'
  return next
}

function loadConfig() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    return mergeConfig(DEFAULT_CONFIG, raw)
  } catch {
    return clone(DEFAULT_CONFIG)
  }
}

function saveConfig(config) {
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8')
  } catch (err) {
    console.warn('[attention-toast] cannot persist config:', err?.message ?? err)
  }
}

/** Locate the XWayland auth cookie; a System-D service does not export XAUTHORITY. */
function findXauthority() {
  if (process.env.XAUTHORITY && existsSync(process.env.XAUTHORITY)) return process.env.XAUTHORITY
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000
  try {
    const dir = '/run/user/' + uid
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.mutter-Xwaylandauth.')) return join(dir, name)
    }
  } catch {
    /* ignore */
  }
  const fallback = join(homedir(), '.Xauthority')
  return existsSync(fallback) ? fallback : undefined
}

export function apply(ctx) {
  for (const candidate of [SCRIPT, join(HERE, '..', 'lib', 'toast_host.py')]) {
    if (existsSync(candidate)) {
      if (!existsSync(SCRIPT)) console.warn('[attention-toast] toast host script not at expected path, using', candidate)
    }
  }

  let config = loadConfig()
  let child = null
  let alive = false
  let buffer = ''
  let lastError = null
  let disposed = false
  let stderrTail = ''

  const emitLog = (line) => {
    try {
      const event = JSON.parse(line)
      if (event.event === 'ready') console.log('[attention-toast] toast host ready pid=' + event.pid)
      else if (event.event === 'error') console.warn('[attention-toast] toast host error:', event.message)
    } catch {
      /* non-JSON noise on stdout */
    }
  }

  function stopHost() {
    if (child !== null) {
      try {
        write('{"cmd":"shutdown"}\n')
        child.stdin.end()
      } catch {
        /* ignore */
      }
      const dying = child
      child = null
      alive = false
      setTimeout(() => {
        try { dying.kill('SIGTERM') } catch { /* ignore */ }
      }, 400)
    }
    alive = false
  }

  function write(line) {
    if (child === null) return false
    try {
      child.stdin.write(line)
      return true
    } catch (err) {
      lastError = err?.message ?? String(err)
      return false
    }
  }

  function spawnHost() {
    if (disposed) return false
    if (child !== null) return true
    const env = { ...process.env }
    let command = process.env.DSH_TOAST_PYTHON || process.env.PYTHON || 'python3'
    let args = ['-u', SCRIPT]
    if (IS_WIN) {
      command = process.env.DSH_TOAST_POWERSHELL || 'powershell.exe'
      args = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_WIN]
    } else {
      env.GDK_BACKEND = 'x11'
      env.DISPLAY = process.env.DISPLAY || ':0'
      env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || '/run/user/' + (typeof process.getuid === 'function' ? process.getuid() : 1000)
      const auth = findXauthority()
      if (auth !== undefined) env.XAUTHORITY = auth
      if (env.NO_AT_BRIDGE === undefined) env.NO_AT_BRIDGE = '1'
    }

    try {
      child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    } catch (err) {
      lastError = err?.message ?? String(err)
      console.warn('[attention-toast] cannot spawn toast host:', lastError)
      child = null
      return false
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line !== '') emitLog(line)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk).slice(-2000)
    })
    child.on('error', (err) => {
      lastError = err?.message ?? String(err)
      alive = false
      console.warn('[attention-toast] toast host error:', lastError)
    })
    child.on('exit', (code, signal) => {
      alive = false
      child = null
      if (!disposed && code !== 0 && code !== null) {
        lastError = 'toast host exited code=' + code + (signal ? ' signal=' + signal : '')
        console.warn('[attention-toast]', lastError, stderrTail.slice(-400))
      }
    })
    alive = true
    write(JSON.stringify({ cmd: 'config', config }) + '\n')
    console.log('[attention-toast] toast host spawned (' + command + ' ' + args.join(' ') + ')')
    return true
  }

  function ensureHost() {
    if (child !== null && alive) return true
    return spawnHost()
  }

  function show(payload) {
    if (!ensureHost()) return { ok: false }
    const command = {
      cmd: 'show',
      id: String(payload?.id ?? Date.now()),
      kind: payload?.kind ?? 'completed',
      title: String(payload?.title ?? ''),
      text: String(payload?.text ?? ''),
      durationMs: Number(payload?.durationMs ?? config.durationMs),
    }
    return { ok: write(JSON.stringify(command) + '\n') }
  }

  const service = {
    getState() {
      return { config: clone(config), hostAlive: alive, desktop: true, lastError }
    },
    updateConfig(patch) {
      config = mergeConfig(config, patch ?? {})
      saveConfig(config)
      if (alive) write(JSON.stringify({ cmd: 'config', config }) + '\n')
      return clone(config)
    },
    show(payload) {
      return show(payload)
    },
    preview() {
      ensureHost()
      return { ok: write('{"cmd":"preview"}\n') }
    },
    closeAll() {
      return { ok: write('{"cmd":"close-all"}\n') }
    },
    getApprovals(sinceSeq) {
      refreshLedger()
      const from = Number.isFinite(sinceSeq) ? sinceSeq : 0
      return {
        seq: ledgerState.seq,
        exists: ledgerState.exists,
        file: LEDGER_PATH,
        items: ledgerState.items.filter((item) => item.seq > from).slice(-30),
      }
    },
    restartHost() {
      stopHost()
      return { ok: spawnHost() }
    },
  }

  Object.defineProperty(service, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service, serviceKey: 'attentionToast', namespace: 'attentionToast' },
  })

  ctx.provide('attentionToast', service)

  ctx.effect(() => {
    ensureHost()
    return () => {
      disposed = true
      stopHost()
    }
  }, 'dsh-attention-toast: toast host lifetime')

  console.log('[dsh-attention-toast] loaded; toast host script = ' + SCRIPT)
}
