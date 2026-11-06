/**
 * dsh-attention-toast — browser half.
 *
 * Task-priority notification logic ported from attention-plugins
 * (main-line / side-line / task modes / 4 event types), delivered as a
 * bottom-right desktop toast by the host half (GTK toast host).
 */
window.__ModuleLoader__.load({
  id: 'dsh-attention-toast',
  factory: (require) => {
    const React = require('react')
    const { createElement: h, useCallback, useEffect, useRef, useState, useSyncExternalStore } = React

    const STORAGE_KEY = 'dsh-attention-toast:config'
    const DEFAULT_TYPES = { completed: true, failed: true, question: true, permission: true }

    const MESSAGES = {
      zh: {
        title: 'Attention Toast',
        subtitle: '主线立即提醒，支线可攒批，提问与审批永远打断你 —— 以桌面右下角浮窗呈现。',
        master: '启用桌面浮窗',
        priority: '任务优先级',
        taskMode: '任务模式',
        modeMainline: '主线模式',
        modeBalanced: '均衡模式',
        modeMainlineHint: '只标记的会话算主线；没标记时全部按支线处理。',
        modeBalancedHint: '没标记任何会话时，所有会话都按主线逐个提醒。',
        sideline: '支线提醒',
        sideEach: '逐个提醒',
        sideBatch: '全部结束汇总',
        events: '事件类型',
        evCompleted: '任务完成',
        evFailed: '任务出错',
        evQuestion: '收到提问',
        evPermission: '等待审批',
        toastBlock: '浮窗外观',
        duration: '显示时长',
        maxVisible: '同屏数量',
        notifyCurrent: '当前会话也提醒',
        notifyCurrentHint: '默认正在看的会话不打扰。',
        test: '测试浮窗',
        restart: '重启宿主',
        hostOn: '浮窗宿主已连接',
        hostOff: '浮窗宿主未连接',
        saved: '已保存',
        mainlineSet: '设为主线任务',
        mainlineUnset: '取消主线标记',
        allDone: '支线任务全部结束',
        allDoneBody: '{n} 个后台会话已空闲',
        doneBody: '任务已完成',
        failedBody: '任务出错',
        questionBody: '等待你回答',
        permissionBody: '等待你审批',
        seconds: '秒',
        count: '个',
        modeSilent: '静默模式',
        modeSilentHint: '完成与出错不弹浮窗；提问与审批仍然提醒。',
        waitSub: '等待子智能体',
        waitSubHint: '父会话结束时子代理仍在跑，等整波空闲再提醒。',
        currentMode: '当前会话',
        curHidden: '仅后台提醒',
        curUnfocused: '失焦或后台',
        curAlways: '总是提醒',
        mute: '静音此会话',
        unmute: '取消静音',
        mutedBadge: '已静音',
      },
      en: {
        title: 'Attention Toast',
        subtitle: 'Main-line tasks interrupt immediately; side-line tasks can batch; questions and approvals always interrupt — shown as a desktop toast.',
        master: 'Enable desktop toasts',
        priority: 'Task priority',
        taskMode: 'Task mode',
        modeMainline: 'Main-line',
        modeBalanced: 'Balanced',
        modeMainlineHint: 'Only marked sessions are main-line; with no marker every session is side-line.',
        modeBalancedHint: 'With no marker, every session alerts individually.',
        sideline: 'Side-line alerts',
        sideEach: 'Each task',
        sideBatch: 'When all finish',
        events: 'Event types',
        evCompleted: 'Completed',
        evFailed: 'Failed',
        evQuestion: 'Question',
        evPermission: 'Approval',
        toastBlock: 'Toast appearance',
        duration: 'Duration',
        maxVisible: 'Max visible',
        notifyCurrent: 'Also alert for the current session',
        notifyCurrentHint: 'The session you are viewing stays quiet by default.',
        test: 'Preview toast',
        restart: 'Restart host',
        hostOn: 'Toast host connected',
        hostOff: 'Toast host offline',
        saved: 'Saved',
        mainlineSet: 'Mark as main-line',
        mainlineUnset: 'Unmark main-line',
        allDone: 'All side-line tasks finished',
        allDoneBody: '{n} background sessions are idle',
        doneBody: 'Task completed',
        failedBody: 'Task failed',
        questionBody: 'Waiting for your answer',
        permissionBody: 'Waiting for your approval',
        seconds: 's',
        count: '',
        modeSilent: 'Silent',
        modeSilentHint: 'No toast on completion or failure; questions and approvals still alert.',
        waitSub: 'Wait for subagents',
        waitSubHint: 'If subagents are still running when the parent finishes, alert once the wave is idle.',
        currentMode: 'Current session',
        curHidden: 'Only when hidden',
        curUnfocused: 'When unfocused',
        curAlways: 'Always',
        mute: 'Mute this session',
        unmute: 'Unmute session',
        mutedBadge: 'muted',
      },
    }

    const isZh = () => {
      try {
        return (navigator.language || 'zh').toLowerCase().startsWith('zh')
      } catch {
        return true
      }
    }
    const t = (key) => MESSAGES[isZh() ? 'zh' : 'en'][key] ?? key

    // ── settings ────────────────────────────────────────────────────────────
    const MAINLINE_MODES = ['mainline', 'balanced', 'silent']
    const CURRENT_MODES = ['hidden', 'unfocused', 'always']

    function normalizeSettings(raw) {
      const value = raw !== null && typeof raw === 'object' ? raw : {}
      const types = { ...DEFAULT_TYPES }
      if (value.types !== null && typeof value.types === 'object') {
        for (const key of Object.keys(types)) {
          if (typeof value.types[key] === 'boolean') types[key] = value.types[key]
        }
      }
      const toast = value.toast !== null && typeof value.toast === 'object' ? value.toast : {}

      // Three-way task mode (0.2.2). Migrate the old taskMode + sidelineMode pair:
      //   balanced            -> balanced
      //   mainline + per-session -> balanced (every session rings on its own)
      //   mainline + batch       -> mainline  (one "all tasks" pool)
      let mainlineMode = value.mainlineMode
      if (!MAINLINE_MODES.includes(mainlineMode)) {
        if (value.taskMode === 'balanced' || value.sidelineMode === 'per-session') mainlineMode = 'balanced'
        else mainlineMode = 'mainline'
      }

      // Current-session gate (0.2.2). Migrate the old notifyCurrent boolean.
      let currentSessionMode = value.currentSessionMode
      if (!CURRENT_MODES.includes(currentSessionMode)) {
        currentSessionMode = value.notifyCurrent === true ? 'always' : 'hidden'
      }

      return {
        enabled: value.enabled !== false,
        mainlineMode,
        currentSessionMode,
        waitForSubagents: value.waitForSubagents !== false,
        types,
        toast: {
          durationMs: Math.min(60000, Math.max(2000, Number(toast.durationMs) || 8000)),
          maxVisible: Math.min(6, Math.max(1, Number(toast.maxVisible) || 3)),
        },
        mainlineSessionIds: Array.isArray(value.mainlineSessionIds)
          ? value.mainlineSessionIds.filter((id) => typeof id === 'string' && id.length > 0)
          : [],
        mutedSessionIds: Array.isArray(value.mutedSessionIds)
          ? value.mutedSessionIds.filter((id) => typeof id === 'string' && id.length > 0)
          : [],
      }
    }

    /** Keep the old name so the settings store and tests read naturally. */
    const normalize = normalizeSettings

    function isMutedSession(sessionId, muted) {
      return Array.isArray(muted) && muted.includes(sessionId)
    }

    /**
     * Decide how one event should be delivered.
     * 'alert' = show now, 'aggregate' = pool into the "all tasks" toast,
     * 'never' = muted session or silent mode.
     */
    function decideAlert(kind, mainlineMode, markedMainline, muted) {
      if (muted) return 'never'
      if (kind === 'question' || kind === 'permission') return 'alert'
      if (mainlineMode === 'silent') return 'never'
      if (mainlineMode === 'balanced') return 'alert'
      return markedMainline ? 'alert' : 'aggregate'
    }

    /** Current-session gate: hidden / unfocused / always. */
    function shouldAlertCurrentSession(mode, state) {
      if (mode === 'always') return true
      if (mode === 'unfocused') return state.hidden === true || state.focused !== true
      return state.hidden === true
    }

    /** Running sessions whose direct parent is sessionId. */
    function countRunningChildren(sessionId, rows) {
      let count = 0
      for (const row of rows) {
        if (row && row.parentSessionId === sessionId && row.running === true) count += 1
      }
      return count
    }

    let settings = (() => {
      try {
        return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'))
      } catch {
        return normalize({})
      }
    })()

    const settingsListeners = new Set()
    const subscribeSettings = (fn) => {
      settingsListeners.add(fn)
      return () => { settingsListeners.delete(fn) }
    }
    const getSettings = () => settings

    function commitSettings(next) {
      settings = normalize(next)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      } catch (err) {
        console.warn('[attention-toast] cannot persist settings:', err)
      }
      for (const fn of [...settingsListeners]) {
        try { fn() } catch (err) { console.warn(err) }
      }
      queueHostSync()
    }

    function patchSettings(patch) {
      commitSettings({ ...settings, ...patch })
    }

    // ── main-line marker store ──────────────────────────────────────────────
    function isMainlineSession(sessionId, marked, mode) {
      if (marked.length > 0) return marked.includes(sessionId)
      return mode === 'balanced'
    }

    function toggleMainline(sessionId) {
      const ids = settings.mainlineSessionIds
      const next = ids.includes(sessionId) ? ids.filter((id) => id !== sessionId) : [...ids, sessionId]
      patchSettings({ mainlineSessionIds: next })
    }

    function toggleMute(sessionId) {
      const ids = settings.mutedSessionIds
      const next = ids.includes(sessionId) ? ids.filter((id) => id !== sessionId) : [...ids, sessionId]
      patchSettings({ mutedSessionIds: next })
    }

    const mainlineStore = {
      subscribe: subscribeSettings,
      getSnapshot: () => settings.mainlineSessionIds,
    }

    // ── host bridge ─────────────────────────────────────────────────────────
    let remoteApi = null
    let hostAlive = false
    let syncTimer = null

    function pushHostConfig() {
      if (remoteApi === null) return
      try {
        Promise.resolve(remoteApi.updateConfig({
          locale: isZh() ? 'zh' : 'en',
          durationMs: settings.toast.durationMs,
          maxVisible: settings.toast.maxVisible,
        })).catch(() => {})
      } catch { /* ignore */ }
    }

    function queueHostSync() {
      if (syncTimer !== null) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => { syncTimer = null; pushHostConfig() }, 300)
    }

    function sendToast(payload) {
      if (remoteApi === null) return
      try {
        Promise.resolve(remoteApi.show(payload)).catch(() => {})
      } catch { /* ignore */ }
    }

    // ── notification engine (ported from attention-plugins) ─────────────────
    class NotificationEngine {
      constructor(ports) {
        this.ports = ports
        this.prevRunning = new Map()
        this.runs = new Map()
        this.settling = new Set()
        this.pendingKeys = new Map()
        this.errors = new Map()
        this.errorCounts = new Map()
        this.deferred = new Map()
        this.hadRunning = false
        this.poolPending = false
        this.aggregateSentThisWave = false
      }

      aggregates() {
        return this.ports.aggregateEnabled()
      }

      anyRunning() {
        for (const value of this.prevRunning.values()) {
          if (value) return true
        }
        return false
      }

      observe(sessions) {
        const seen = new Set()
        let hasRunning = false
        for (const summary of Object.values(sessions.byId || {})) {
          const id = summary.id
          seen.add(id)
          if (summary.running) hasRunning = true
          const prev = this.prevRunning.get(id) ?? false
          const now = summary.running
          if (prev && !now) void this.settleRun(id)
          else if (!prev && now) this.armRun(id)
          this.prevRunning.set(id, now)
        }
        if (this.aggregates() && this.poolPending && this.hadRunning && !hasRunning && !this.aggregateSentThisWave) {
          this.emitSidelineComplete()
        }
        this.hadRunning = hasRunning
        this.flushDeferred()
        for (const id of [...this.prevRunning.keys()]) {
          if (!seen.has(id)) this.forget(id)
        }
      }

      observeStatus(sessionId, running) {
        const prev = this.prevRunning.get(sessionId) ?? false
        if (prev && !running) void this.settleRun(sessionId)
        else if (!prev && running) this.armRun(sessionId)
        this.prevRunning.set(sessionId, running)
        const hasRunning = this.anyRunning()
        if (this.aggregates() && this.poolPending && this.hadRunning && !hasRunning && !this.aggregateSentThisWave) {
          this.emitSidelineComplete()
        }
        this.hadRunning = hasRunning
        this.flushDeferred()
      }

      observeAdded(summary) {
        if (summary === null || summary === undefined || summary.id === undefined) return
        if (this.prevRunning.has(summary.id)) return
        const running = summary.running === true
        this.prevRunning.set(summary.id, running)
        if (running) {
          this.armRun(summary.id)
          this.hadRunning = true
        }
      }

      observeRemoved(sessionId) {
        this.deferred.delete(sessionId)
        this.forget(sessionId)
      }

      forget(sessionId) {
        this.prevRunning.delete(sessionId)
        this.runs.delete(sessionId)
        this.pendingKeys.delete(sessionId)
        this.errors.delete(sessionId)
        this.errorCounts.delete(sessionId)
      }

      observeError(sessionId, message) {
        if (typeof message === 'string' && message.length > 0) {
          this.errors.set(sessionId, message)
          this.errorCounts.set(sessionId, (this.errorCounts.get(sessionId) ?? 0) + 1)
        }
      }

      observePending(pending, options = {}) {
        for (const [id, facts] of pending) {
          const prevKey = this.pendingKeys.get(id)
          if (prevKey === undefined || prevKey !== facts.key) {
            const kind = facts.kind === 'approval' ? 'permission' : 'question'
            if (options.silent !== true && this.ports.alertAction(kind, id) !== 'never') {
              this.ports.emit({ kind, sessionId: id, title: this.ports.titleOf(id), detail: facts.detail })
            }
          }
          this.pendingKeys.set(id, facts.key)
        }
        for (const id of [...this.pendingKeys.keys()]) {
          if (!pending.has(id)) this.pendingKeys.delete(id)
        }
      }

      seed(sessions) {
        let hasRunning = false
        for (const summary of Object.values(sessions.byId || {})) {
          this.prevRunning.set(summary.id, summary.running)
          if (summary.running) {
            this.armRun(summary.id)
            hasRunning = true
          }
        }
        this.hadRunning = hasRunning
      }

      armRun(id) {
        const detail = this.ports.detailOf(id)
        this.runs.set(id, {
          baselineTurnErrorSeq: detail?.maxTurnErrorSeq ?? 0,
          baselineAgentError: detail?.lastAgentError ?? null,
          baselineErrorCount: this.errorCounts.get(id) ?? 0,
        })
        if (!this.hadRunning) {
          this.aggregateSentThisWave = false
          this.poolPending = false
        }
      }

      async settleRun(id) {
        const run = this.runs.get(id)
        if (run === undefined || this.settling.has(id)) return
        this.runs.delete(id)
        this.settling.add(id)
        try {
          await this.ports.settle()
          if (this.runs.has(id)) return
          const detail = this.ports.detailOf(id)
          const errorCount = this.errorCounts.get(id) ?? 0
          const errorDuringRun = errorCount > run.baselineErrorCount ? (this.errors.get(id) ?? null) : null
          const failed = (detail !== undefined && (
            detail.maxTurnErrorSeq > run.baselineTurnErrorSeq ||
            (detail.lastAgentError !== null && detail.lastAgentError !== run.baselineAgentError)
          )) || errorDuringRun !== null
          const message = failed
            ? (detail?.failureMessage ?? errorDuringRun ?? detail?.lastAgentError ?? '')
            : (detail?.finalText ?? '')
          const kind = failed ? 'failed' : 'completed'
          const event = { kind, sessionId: id, title: this.ports.titleOf(id), detail: message }

          const action = this.ports.alertAction(kind, id)
          if (action === 'never') return
          if (action === 'aggregate') {
            this.poolPending = true
            if (this.anyRunning()) return
            if (this.aggregates() && !this.aggregateSentThisWave) this.emitSidelineComplete()
            return
          }
          if (this.ports.waitForSubagents() && this.ports.runningChildren(id) > 0) {
            this.deferred.set(id, event)
            return
          }
          this.ports.emit(event)
        } finally {
          this.settling.delete(id)
          this.flushDeferred()
        }
      }

      flushDeferred() {
        if (this.deferred.size === 0) return
        for (const [id, event] of [...this.deferred]) {
          if (this.ports.runningChildren(id) > 0) continue
          this.deferred.delete(id)
          this.ports.emit(event)
        }
      }

      emitSidelineComplete() {
        if (this.prevRunning.size === 0) return
        this.poolPending = false
        this.aggregateSentThisWave = true
        const id = [...this.prevRunning.keys()][0]
        this.ports.emit({
          kind: 'sidelinedone',
          sessionId: id,
          title: t('allDone'),
          detail: t('allDoneBody').replace('{n}', String(this.prevRunning.size)),
        })
      }
    }

    // ── pending interactions (questions / approvals) ─────────────────────────
    function pendingDetail(interaction) {
      if (interaction.kind === 'approval') {
        const tool = typeof interaction.toolName === 'string' ? interaction.toolName : ''
        const reason = typeof interaction.reason === 'string' ? interaction.reason : ''
        if (tool !== '' && reason !== '') return tool + ' — ' + reason
        return reason !== '' ? reason : tool
      }
      const questions = interaction.questions
      if (Array.isArray(questions) && questions.length > 0) {
        const first = questions[0]
        if (first && typeof first.question === 'string') return first.question
      }
      return ''
    }

    function collectPending(snapshot) {
      const facts = new Map()
      if (!snapshot || typeof snapshot.forEach !== 'function') return facts
      snapshot.forEach((status, id) => {
        const interaction = status?.pendingInteraction
        if (!interaction) return
        const key = typeof interaction.key === 'string' ? interaction.key : ''
        if (key === '') return
        facts.set(id, {
          key,
          kind: interaction.kind === 'approval' ? 'approval' : 'question',
          detail: pendingDetail(interaction),
        })
      })
      return facts
    }

    // ── styles ──────────────────────────────────────────────────────────────
    const CSS = [
      '.att-root{display:flex;flex-direction:column;gap:18px;padding:2px 2px 26px;font-size:13px;color:var(--dsw-alias-label-primary,inherit);max-width:560px}',
      '.att-hero{margin:0}',
      '.att-title{margin:0;font-size:19px;font-weight:650;letter-spacing:.01em}',
      '.att-sub{margin:6px 0 0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.att-block{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:12px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03))}',
      '.att-block-title{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.att-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:28px}',
      '.att-label{font-size:13px;color:var(--dsw-alias-label-secondary,#b9c0c8)}',
      '.att-hint{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.att-switch{position:relative;width:38px;height:22px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.06));cursor:pointer;padding:0;flex:none;transition:background .15s ease,border-color .15s ease}',
      '.att-switch[data-on="true"]{background:#2ea043;border-color:transparent}',
      '.att-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;opacity:.85;transition:transform .15s ease}',
      '.att-switch[data-on="true"]::after{transform:translateX(16px);opacity:1}',
      '.att-seg{display:flex;gap:2px;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.05));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}',
      '.att-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#b9c0c8);font-size:12px;padding:4px 10px;border-radius:7px;cursor:pointer;transition:background .12s ease,color .12s ease}',
      '.att-seg button[data-on="true"]{background:var(--dsw-alias-state-business-primary,#2f6feb);color:#fff}',
      '.att-btn{border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));color:var(--dsw-alias-label-primary,inherit);font-size:12px;padding:5px 12px;border-radius:8px;cursor:pointer}',
      '.att-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}',
      '.att-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.att-dot{width:8px;height:8px;border-radius:50%;display:inline-block}',
      '.att-star{display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:6px;background:transparent;cursor:pointer;font-size:15px;line-height:1;transition:background .15s ease}',
    ].join('')

    function useStyleOnce() {
      useEffect(() => {
        if (document.getElementById('att-style')) return
        const style = document.createElement('style')
        style.id = 'att-style'
        style.textContent = CSS
        document.head.appendChild(style)
      }, [])
    }

    // ── small primitives ────────────────────────────────────────────────────
    function Switch(props) {
      return h('button', {
        className: 'att-switch',
        type: 'button',
        'data-on': props.on ? 'true' : 'false',
        'aria-pressed': props.on ? 'true' : 'false',
        disabled: props.disabled,
        onClick: () => props.onChange(!props.on),
      })
    }

    function Segmented(props) {
      return h('div', { className: 'att-seg', role: 'tablist' },
        props.options.map(([value, label]) => h('button', {
          key: value,
          type: 'button',
          role: 'tab',
          'data-on': props.value === value ? 'true' : 'false',
          'aria-selected': props.value === value ? 'true' : 'false',
          disabled: props.disabled,
          onClick: () => props.onChange(value),
        }, label)))
    }

    function Row(props) {
      return h('div', { className: 'att-row' },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
          h('span', { className: 'att-label' }, props.label),
          props.hint ? h('span', { className: 'att-hint' }, props.hint) : null),
        props.children)
    }

    // ── settings section ────────────────────────────────────────────────────
    function SettingsSection() {
      useStyleOnce()
      const current = useSyncExternalStore(subscribeSettings, getSettings)
      const [host, setHost] = useState(null)
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        let cancelled = false
        const refresh = () => {
          if (remoteApi === null) return
          Promise.resolve(remoteApi.getState()).then((result) => {
            if (cancelled) return
            if (result && result.ok && result.value) {
              hostAlive = result.value.hostAlive === true
              setHost(hostAlive)
            } else {
              setHost(false)
            }
          }).catch(() => { if (!cancelled) setHost(false) })
        }
        refresh()
        const timer = setInterval(refresh, 5000)
        return () => { cancelled = true; clearInterval(timer) }
      }, [])

      const runPreview = () => {
        if (remoteApi === null) return
        setBusy(true)
        Promise.resolve(remoteApi.preview()).catch(() => {}).then(() => setTimeout(() => setBusy(false), 600))
      }
      const restart = () => {
        if (remoteApi === null) return
        Promise.resolve(remoteApi.restartHost()).catch(() => {})
      }

      const disabled = !current.enabled
      const modeHint = current.mainlineMode === 'silent'
        ? t('modeSilentHint')
        : current.mainlineMode === 'balanced' ? t('modeBalancedHint') : t('modeMainlineHint')

      return h('div', { className: 'att-root' },
        h('div', { className: 'att-hero' },
          h('h2', { className: 'att-title' }, t('title')),
          h('p', { className: 'att-sub' }, t('subtitle'))),

        h('div', { className: 'att-block' },
          h(Row, { label: t('master') },
            h(Switch, { on: current.enabled, onChange: (v) => patchSettings({ enabled: v }) }))),

        h('div', { className: 'att-block', style: disabled ? { opacity: 0.5 } : null },
          h('div', { className: 'att-block-title' }, t('priority')),
          h(Row, { label: t('taskMode'), hint: modeHint }, h(Segmented, {
            value: current.mainlineMode,
            disabled,
            options: [['mainline', t('modeMainline')], ['balanced', t('modeBalanced')], ['silent', t('modeSilent')]],
            onChange: (v) => patchSettings({ mainlineMode: v }),
          })),
          h(Row, { label: t('waitSub'), hint: t('waitSubHint') },
            h(Switch, {
              on: current.waitForSubagents !== false,
              disabled,
              onChange: (v) => patchSettings({ waitForSubagents: v }),
            }))),

        h('div', { className: 'att-block', style: disabled ? { opacity: 0.5 } : null },
          h('div', { className: 'att-block-title' }, t('events')),
          [['completed', t('evCompleted')], ['failed', t('evFailed')], ['question', t('evQuestion')], ['permission', t('evPermission')]]
            .map(([kind, label]) => h(Row, { key: kind, label },
              h(Switch, {
                on: current.types[kind] !== false,
                disabled,
                onChange: (v) => patchSettings({ types: { ...current.types, [kind]: v } }),
              })))),

        h('div', { className: 'att-block', style: disabled ? { opacity: 0.5 } : null },
          h('div', { className: 'att-block-title' }, t('toastBlock')),
          h(Row, { label: t('duration') }, h(Segmented, {
            value: String(current.toast.durationMs),
            disabled,
            options: [['4000', '4' + t('seconds')], ['6000', '6' + t('seconds')], ['8000', '8' + t('seconds')], ['12000', '12' + t('seconds')]],
            onChange: (v) => patchSettings({ toast: { ...current.toast, durationMs: Number(v) } }),
          })),
          h(Row, { label: t('maxVisible') }, h(Segmented, {
            value: String(current.toast.maxVisible),
            disabled,
            options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']],
            onChange: (v) => patchSettings({ toast: { ...current.toast, maxVisible: Number(v) } }),
          })),
          h(Row, { label: t('currentMode') }, h(Segmented, {
            value: current.currentSessionMode,
            disabled,
            options: [['hidden', t('curHidden')], ['unfocused', t('curUnfocused')], ['always', t('curAlways')]],
            onChange: (v) => patchSettings({ currentSessionMode: v }),
          }))),

        h('div', { className: 'att-foot' },
          h('button', { className: 'att-btn', type: 'button', disabled: busy || disabled, onClick: runPreview }, busy ? '…' : t('test')),
          h('button', { className: 'att-btn', type: 'button', disabled, onClick: restart }, t('restart')),
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #8b949e)' } },
            h('span', { className: 'att-dot', style: { background: host ? '#2ea043' : '#8b949e' } }),
            host ? t('hostOn') : t('hostOff'))))
    }

    // ── composer main-line star ─────────────────────────────────────────────
    function ComposerStar(props) {
      useStyleOnce()
      const ids = useSyncExternalStore(mainlineStore.subscribe, mainlineStore.getSnapshot)
      const sessionId = props.sessionId
      const active = sessionId !== null && sessionId !== undefined && ids.includes(sessionId)
      if (sessionId === null || sessionId === undefined) return null
      return h('button', {
        className: 'att-star',
        type: 'button',
        title: t(active ? 'mainlineUnset' : 'mainlineSet'),
        'aria-pressed': active ? 'true' : 'false',
        style: {
          background: active ? 'rgba(140,180,255,.16)' : 'transparent',
          color: active ? '#a8ccff' : 'var(--dsw-alias-label-tertiary, #8b949e)',
        },
        onClick: () => toggleMainline(sessionId),
      }, h('span', { style: { fontSize: '15px' } }, active ? '★' : '☆'))
    }

    // ── sidebar row menu item ───────────────────────────────────────────────
    function MenuItem(props) {
      const ids = useSyncExternalStore(mainlineStore.subscribe, mainlineStore.getSnapshot)
      const sessionId = props.sessionId
      if (sessionId === null || sessionId === undefined) return null
      let setMenuOpen
      if (typeof props.useMenuOpenState === 'function') {
        try { setMenuOpen = props.useMenuOpenState()?.[1] } catch { setMenuOpen = undefined }
      }
      const active = ids.includes(sessionId)
      const muted = isMutedSession(sessionId, settings.mutedSessionIds)
      const close = () => { try { setMenuOpen?.(false) } catch { /* ignore */ } }
      const styleFor = (highlight) => ({
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 10px',
        border: 'none', borderRadius: '6px', background: 'transparent',
        color: highlight ? '#a8ccff' : 'var(--dsw-alias-label-secondary, #a6a6a6)',
        fontSize: '12.5px', textAlign: 'left', cursor: 'pointer',
      })
      return h(React.Fragment, null,
        h('button', {
          type: 'button', role: 'menuitem', style: styleFor(active),
          onClick: (event) => { event.stopPropagation(); close(); toggleMainline(sessionId) },
        }, h('span', null, active ? '★' : '☆'), h('span', null, t(active ? 'mainlineUnset' : 'mainlineSet'))),
        h('button', {
          type: 'button', role: 'menuitem', style: styleFor(muted),
          onClick: (event) => { event.stopPropagation(); close(); toggleMute(sessionId) },
        }, h('span', null, muted ? '🔕' : '🔔'), h('span', null, t(muted ? 'unmute' : 'mute'))))
    }

    // ── toast dispatch ──────────────────────────────────────────────────────
    function deliver(event) {
      if (!settings.enabled) return
      if (settings.types[event.kind] === false) return
      if (event.kind !== 'sidelinedone') {
        const isCurrent = viewTracker.current === event.sessionId
        const alert = shouldAlertCurrentSession(settings.currentSessionMode, {
          hidden: document.hidden,
          focused: typeof document.hasFocus === 'function' ? document.hasFocus() : true,
        })
        if (isCurrent && !alert) return
      }
      let text = event.detail
      if (event.kind === 'sidelinedone') text = event.detail
      else if (!text || text.length === 0) text = t(event.kind === 'failed' ? 'failedBody' : event.kind === 'completed' ? 'doneBody' : event.kind === 'question' ? 'questionBody' : 'permissionBody')
      sendToast({
        id: event.sessionId + ':' + event.kind + ':' + Date.now(),
        kind: event.kind,
        title: event.kind === 'sidelinedone' ? t('allDone') : (event.title || 'Untitled'),
        text: String(text).slice(0, 400),
        durationMs: settings.toast.durationMs,
      })
    }

    const viewTracker = { current: null }

    // ── remote contribution ─────────────────────────────────────────────────
    const codec = (parse) => ({ parse })
    const stateCodec = codec((value) => ({
      config: value && value.config ? value.config : null,
      hostAlive: value?.hostAlive === true,
      desktop: value?.desktop === true,
      lastError: typeof value?.lastError === 'string' ? value.lastError : null,
    }))
    const configCodec = codec((value) => value)
    const ackCodec = codec((value) => ({ ok: value?.ok === true }))
    const patchCodec = codec((value) => value)
    const showCodec = codec((value) => value)

    const strict = (typeSymbol, schema) => ({ mode: 'strict', typeSymbol, schema, create: () => schema })

    const CONTRIBUTION = {
      package: 'dsh-attention-toast',
      descriptors: [
        { id: 'dsh-attention-toast#attentionToast/getState', service: 'attentionToast', namespace: 'attentionToast', method: 'getState', invocation: { kind: 'direct' }, parameters: [], result: strict('dsh-attention-toast#ToastState', stateCodec) },
        { id: 'dsh-attention-toast#attentionToast/updateConfig', service: 'attentionToast', namespace: 'attentionToast', method: 'updateConfig', invocation: { kind: 'direct' }, parameters: [{ name: 'patch', wire: 'patch', source: 'json', codec: strict('dsh-attention-toast#ToastConfigPatch', patchCodec) }], result: strict('dsh-attention-toast#ToastConfig', configCodec) },
        { id: 'dsh-attention-toast#attentionToast/show', service: 'attentionToast', namespace: 'attentionToast', method: 'show', invocation: { kind: 'direct' }, parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: strict('dsh-attention-toast#ToastPayload', showCodec) }], result: strict('dsh-attention-toast#ToastAck', ackCodec) },
        { id: 'dsh-attention-toast#attentionToast/preview', service: 'attentionToast', namespace: 'attentionToast', method: 'preview', invocation: { kind: 'direct' }, parameters: [], result: strict('dsh-attention-toast#ToastAck', ackCodec) },
        { id: 'dsh-attention-toast#attentionToast/closeAll', service: 'attentionToast', namespace: 'attentionToast', method: 'closeAll', invocation: { kind: 'direct' }, parameters: [], result: strict('dsh-attention-toast#ToastAck', ackCodec) },
        { id: 'dsh-attention-toast#attentionToast/restartHost', service: 'attentionToast', namespace: 'attentionToast', method: 'restartHost', invocation: { kind: 'direct' }, parameters: [], result: strict('dsh-attention-toast#ToastAck', ackCodec) },
      ],
    }

    // ── plugin entry ────────────────────────────────────────────────────────
    const inject = ['slots', 'remote', 'sessions', 'uiSession']

    function apply(ctx) {
      const slots = ctx.slots

      if (slots && typeof slots.inject === 'function') {
        ctx.effect(() => {
          const dispose = slots.inject('settings.section', () => slots.register({
            name: 'settings.section',
            id: 'dsh-attention-toast',
            order: 160,
            label: () => 'Attention Toast',
            inject: () => ({}),
          }, SettingsSection))
          return () => dispose?.()
        }, 'attention-toast: settings section')

        ctx.effect(() => {
          const dispose = slots.inject('conversation.input.left', () => slots.register({
            name: 'conversation.input.left',
            id: 'attention-toast-composer',
            order: 120,
            inject: () => ({}),
          }, ComposerStar))
          return () => dispose?.()
        }, 'attention-toast: composer star')

        ctx.effect(() => {
          const dispose = slots.inject('sidebar.workspaces.session.menu.item', () => slots.register({
            name: 'sidebar.workspaces.session.menu.item',
            id: 'attention-toast-menu',
            order: 150,
            label: () => 'Attention Toast',
            inject: () => ({}),
          }, MenuItem))
          return () => dispose?.()
        }, 'attention-toast: sidebar menu')
      }

      // Mount the Typert contribution so remote.attentionToast resolves.
      const remote = ctx.remote
      if (remote && typeof remote.$mount === 'function') {
        Promise.resolve(remote.$mount(CONTRIBUTION)).then((unmount) => {
          remoteApi = ctx.get('remote.attentionToast') ?? null
          ctx.effect(() => () => { try { unmount() } catch { /* ignore */ } }, 'attention-toast: remote contribution')
          if (remoteApi !== null) pushHostConfig()
        }).catch((err) => console.warn('[attention-toast] remote mount failed:', err))
      }

      // ── notification engine wiring ────────────────────────────────────────
      ctx.effect(() => {
        const sessionsSvc = ctx.sessions
        const listOf = () => sessionsSvc?.list?.getSnapshot?.()

        const engine = new NotificationEngine({
          titleOf: (sessionId) => {
            const row = listOf()?.byId?.[sessionId]
            return row?.title || 'Untitled'
          },
          detailOf: (sessionId) => {
            const row = listOf()?.byId?.[sessionId]
            if (row === undefined) return undefined
            return {
              maxTurnErrorSeq: 0,
              failureMessage: null,
              lastAgentError: row.lastAgentError ?? null,
              finalText: '',
            }
          },
          alertAction: (kind, sessionId) => {
            const marked = isMainlineSession(sessionId, settings.mainlineSessionIds, settings.mainlineMode)
            return decideAlert(kind, settings.mainlineMode, marked, isMutedSession(sessionId, settings.mutedSessionIds))
          },
          runningChildren: (sessionId) => {
            const snapshot = listOf()
            const rows = snapshot?.byId ? Object.values(snapshot.byId) : []
            return countRunningChildren(sessionId, rows)
          },
          waitForSubagents: () => settings.waitForSubagents,
          isMainline: (sessionId) => isMainlineSession(sessionId, settings.mainlineSessionIds, settings.mainlineMode),
          aggregateEnabled: () => settings.mainlineMode === 'mainline',
          emit: deliver,
          settle: () => new Promise((resolve) => setTimeout(resolve, 120)),
        })

        const snapshot = listOf()
        if (snapshot?.byId) engine.seed(snapshot)

        const offs = []
        const on = (event, handler) => {
          try {
            const off = remote.$on(event, handler)
            if (typeof off === 'function') offs.push(off)
          } catch (err) {
            console.warn('[attention-toast] subscribe failed', event, err)
          }
        }
        if (remote && typeof remote.$on === 'function') {
          on('api-session/added', (summary) => engine.observeAdded(summary))
          on('api-session/removed', (sessionId) => engine.observeRemoved(sessionId))
          on('api-session/status', (sessionId, running) => engine.observeStatus(sessionId, running))
          on('api-session/error', (sessionId, message) => engine.observeError(sessionId, message))
        }

        // Questions / approvals live on the UI status store, not on remote events.
        let pendingOff = () => {}
        const statusStore = ctx.uiSession?.sessionStatus
        if (statusStore && typeof statusStore.subscribe === 'function') {
          let first = true
          const sync = () => {
            try {
              engine.observePending(collectPending(statusStore.getSnapshot()), { silent: first })
              first = false
            } catch (err) {
              console.warn('[attention-toast] pending sync failed:', err)
            }
          }
          pendingOff = statusStore.subscribe(sync)
          sync()
        }

        return () => {
          for (const off of offs) { try { off() } catch { /* ignore */ } }
          try { pendingOff() } catch { /* ignore */ }
        }
      }, 'attention-toast: engine')
    }

    return {
      name: 'dsh-attention-toast',
      inject,
      apply,
      __test: { SettingsSection, normalizeSettings, decideAlert, shouldAlertCurrentSession, countRunningChildren, isMutedSession },
    }
  },
})
