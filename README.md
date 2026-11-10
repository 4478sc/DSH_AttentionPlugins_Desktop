# DSH_AttentionPlugins_Desktop

[![ci](https://github.com/4478sc/DSH_AttentionPlugins_Desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/4478sc/DSH_AttentionPlugins_Desktop/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Desktop edition of [attention-plugins](https://github.com/zjbc2000/attention-plugins).**
> Main-line tasks interrupt you, side-line tasks can batch, questions and approvals
> always interrupt — delivered as a **bottom-right desktop toast** on Windows (WPF)
> and Linux (GTK/XWayland), instead of sounds or browser notifications.

中文 | [English](#english)

## 这是什么

DSH（DeepSeek Harness）同时开五个会话是常态，默认“每个任务完成都提醒”会把你打断五次。
本项目把 [attention-plugins](https://github.com/zjbc2000/attention-plugins) 的主线/支线优先级模型，
换成 **桌面浮窗** 投递：不依赖浏览器页面、窗口最小化也能提醒、不抢焦点、不占任务栏。

| | attention-plugins 0.2.2 | 本项目 |
|---|---|---|
| 提醒形态 | 声音 + 浏览器系统通知 | **桌面浮窗**（Windows WPF / Linux GTK） |
| 运行位置 | 纯浏览器端 | **浏览器端 + 宿主进程**（Typert 服务） |
| 声音 / 自定义音频 | 有 | 无（刻意去掉） |
| 浏览器通知权限 | 需要 | 不需要 |
| 主线标记 | 输入框 ★ + 会话菜单 + 侧栏星标 | 输入框 ★ + 会话菜单（无侧栏星标） |
| 任务模式 | 三档 mainline / balanced / silent | **已合并**：三档（含静默） |
| 子智能体等待 / 会话静音 | 有 | **已合并** |
| 点击通知打开会话 | 有 | 未做（浮窗无反向通道） |

## 效果

![Windows 浮窗](docs/images/toast-win.png)

_任务完成时的右下角浮窗（Windows / WPF 实拍）。_

## 功能

- ⭐ **主线 / 支线分级**：输入框工具行的 ☆/★、会话行「…」菜单的「设为主线任务」，可同时标记多个。
- 🎯 **任务模式**：`主线模式`（只提醒标记的会话，其余按支线处理）/ `均衡模式`（未标记时全部按主线逐个提醒）。
- 🎛 **三档任务模式**：`主线模式`（标记的立即弹，其余汇总一次）/ `均衡模式`（全部逐个弹）/ `静默模式`（完成不弹，提问与审批仍弹）。
- ⏳ **等待子智能体**：父会话结束时子代理仍在跑，则等整波空闲再弹（可用开关关闭）。
- 🔕 **会话静音**：会话行「…」菜单可单独静音/取消静音，该会话所有事件都不弹。
- 👁 **当前会话三档**：仅在后台 / 失焦或后台 / 总是提醒。
- ✅ **4 类事件**：完成 / 出错 / 提问 / 审批，逐项开关；提问与审批永远打断。
- ⚠️ **审批前风险预判**：等待审批的浮窗会附上本地正则预判的风险等级（high/medium），**仅供参考**。
- 👮 **审批联动（只读）**：安装 [dsh-approval-ledger](https://github.com/feely0208/dsh-approval-ledger) 后，等待审批时弹一张「等待审批 · 本地预判风险」浮窗；批准 / 拒绝 / 取消只写入台账，**不再弹结果浮窗**。设置页显示台账连接状态、最近统计与最近 5 条记录。
- 🪟 **桌面浮窗**：右下角堆叠（最多 1–6 个），按类型配色，4/6/8/12 秒自动关闭，悬停暂停，点击或 ✕ 关闭；高度按内容自适应。
- 🖥 **不依赖页面**：浮窗由宿主插件的常驻进程渲染（Windows: PowerShell + WPF；Linux: python3 + GTK3）。
- 🌗 **中英双语设置面板**：设置 → Attention Toast，含「测试浮窗」「重启宿主」与宿主连接状态。

## 架构

```
DSH 客户端（浏览器）
  api-session/status|error|added|removed ─┐
  uiSession.sessionStatus.pendingInteraction ─┤
                                              ▼
                            通知引擎（主/支线、批量、settle）
                                              │
                          门控（总开关 / 事件类型 / 当前会话 / 可见性）
                                              │  ctx.remote.attentionToast.show(payload)
                                              ▼
DSH 宿主（Node）  Typert 服务 attentionToast ──► 常驻浮窗进程
                     show / close / close-all / config / preview / restartHost
                                              │  stdin: 一行一个 JSON
                                              ▼
                     Windows: toast_host.ps1 (WPF)   Linux: toast_host.py (GTK3)
                     stdout: ready / shown / closed / error
```

| 路径 | 作用 |
|---|---|
| `lib/client.js` | 浏览器端：设置页、主线标记、通知引擎、门控、remote 调用 |
| `lib/index.js` | 宿主端：配置存储、常驻宿主进程生命周期、Typert 服务 |
| `lib/toast-registry.js` | 通知 id → 会话/目标元数据的有界、带 TTL 注册表 |
| `lib/host-events.js` | 原生 stdout 事件解析与去重点击队列 |
| `lib/typert.host.js` | Typert 清单（zod v4 codec） |
| `lib/toast_host.ps1` | Windows 浮窗宿主（WPF，异步读 stdin，DPI 感知） |
| `lib/toast_host.py` | Linux 浮窗宿主（GTK3 / XWayland override-redirect） |
| `tests/` | 清单/协议测试（`node --test`） |
| `scripts/smoke-toast.ps1` | 浮窗冒烟：起宿主、弹一张、断言自动关闭 |

### 通知身份契约（issue #1 第 1 步）

每条 `show()` 现在带 `sessionId` / `target` / `sessionIds` / `interactionKey`，宿主用 `lib/toast-registry.js` 记住 `id → 目标`，后续点击导航只按 id 查表，不解析标题或正文。

| 字段 | 含义 |
|---|---|
| `id` | 稳定通知 id：普通事件 `<sessionId>:<kind>:<serial>`，审批 `pending:<seq>`，汇总 `summary:<waveSeq>` |
| `sessionId` | 该通知对应的会话；汇总时取列表第一项 |
| `target` | `session` / `approval` / `question` / `summary` |
| `sessionIds` | 汇总通知关联的支线会话列表 |
| `interactionKey` | 待审批的交互 key，供后续定位审批区域使用 |

本步只建立契约和 id 映射，原生点击事件与客户端导航在后续 PR 接入。

### 原生点击事件（issue #1 第 2 步）

- GTK：点击卡片先 `clicked` 再 `closed reason=click`；点击 ✕ 只发 `closed reason=dismiss`。
- WPF：卡片点击走同一套 `clicked → closed click`，✕ 只 `dismiss`，并设置 `Handled` 防止事件冒泡成两次点击。
- Node：`lib/host-events.js` 解析事件；同 id 500ms 内去重，`closed` 时删除注册表目标。

## 安装

要求：DSH 桌面版 ≥ 0.1.7（验证于 0.2.1-rc.3 / 0.2.0-rc.3），Windows 需 PowerShell 5.1，Linux 需 python3 + PyGObject。

```powershell
# 1) 打包成自包含 tarball（本项目依赖 zod；离线机器需要把 zod 一起打进去）
& "$env:USERPROFILE\.dsh\skills\dsh-plugin-install\scripts\pack-plugin.ps1" `
    -Source "F:\dsh_somedata\dsh-attention-toast" -IncludeNodeModules -DropDependency zod

# 2) 安装（写 C:\Users\<you>\.dsh，需完整访问权限）
& "A:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add `
    "C:\Users\<you>\.dsh\plugin-packages\dsh-attention-toast-0.2.2-desktop.4.tgz"

# 3) 重启 DSH 桌面版
```

联网环境也可以直接 `dsh plugin --profile desktop add dsh-attention-toast`（依赖自动安装）。

> ⚠️ 不要用 `link:` 安装。DSH 重装/回滚或删 profile 时会穿透 junction，把源码目录清空。

卸载：`dsh plugin --profile desktop remove dsh-attention-toast`，再删除
`~/.dsh/storages/dsh-attention-toast` 与浏览器里的 `dsh-attention-toast:config`。

## 配置与存储

| 内容 | 位置 |
|---|---|
| 界面配置（模式、事件开关、时长） | 浏览器 `localStorage` 键 `dsh-attention-toast:config` |
| 浮窗外观（配色、时长、同屏数量） | `$DSH_HOME/storages/dsh-attention-toast/config.json` |
| 宿主诊断日志 | `$DSH_HOME/storages/dsh-attention-toast/host.log` |
| 宿主单实例 pid | `$DSH_HOME/storages/dsh-attention-toast/host.pid` |
| 审批台账（只读，由 dsh-approval-ledger 写入） | `$DSH_HOME/approval-ledger/ledger.jsonl` |

总开关默认**开启**；「当前会话也提醒」默认关闭（正在看的会话完成时不打扰，窗口最小化时仍提醒）。

## 免责声明

- 「等待审批」浮窗里的**预判风险**由本地正则特征匹配得出；批准 / 拒绝 / 取消后的风险由可选的 [dsh-approval-ledger](https://github.com/feely0208/dsh-approval-ledger) 台账记录，但**不再弹结果浮窗**。预判**仅供参考**，不构成安全保证，也不代表本插件会对操作做风险判断。
- 本插件**只读**该台账文件（`$DSH_HOME/approval-ledger/ledger.jsonl`），不拦截、不批准、不修改任何审批决策；审批行为与结果由 DSH 与台账插件负责。
- 台账缺失、格式变化或数据错误时，本插件会自动降级为“无审批联动”，不影响通知功能。
- 是否依据这些提示做出决定由你自行判断，使用后果自负。

## 排障

- **点「测试浮窗」没反应**：看 `host.log` 最后几行；没有 `spawn` 行说明宿主插件没加载（清单/patch 行问题）。
- **浮窗不消失**：确认鼠标没有停在浮窗上（悬停会暂停计时）；仍不消失就点「重启宿主」。
- **重复浮窗**：重载过插件时可能残留旧宿主；点「重启宿主」清理。
- **Linux 无浮窗**：需要 XWayland（`DISPLAY` 可用）；纯 Wayland 无 XWayland 的环境不支持。
- **文字被裁**：浮窗高度按内容测量 + 兜底，若仍异常请附 `host.log` 与截图。

## 开发与测试

```powershell
npm test                       # 清单、台账适配器、客户端逻辑
python -m py_compile lib/toast_host.py
powershell -NoProfile -File scripts/smoke-toast.ps1   # 需要桌面会话
```

跨插件联动（台账写入 → 适配器 → 浮窗载荷）的端到端测试在工作区根目录：

```bash
node tests/integration.test.mjs
```

## 路线图

- [x] 合并 upstream 0.2.2：三档任务模式（silent）、当前会话三档、子智能体等待、会话静音；
- [ ] 浮窗点击打开对应会话（需要宿主 → 客户端反向通道）；
- [ ] 侧栏主线星标；
- [ ] 引擎单元测试（从上游测试移植）；
- [ ] Linux 下的通知声音（可选）。

## License

MIT。通知引擎与设置模型来自 [attention-plugins](https://github.com/zjbc2000/attention-plugins)（MIT, © zjbc2000），
桌面浮窗的形态与协议参考 [dsh-notify-yimit](https://github.com/YiMlT/dsh-notify-yimit)（MIT, © YiMlT）；
attention-plugins 的上游 dsh-session-notification 为 BSD-3-Clause。
完整声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

---

## English

**DSH_AttentionPlugins_Desktop** is the desktop edition of attention-plugins for
DeepSeek Harness. It keeps the main-line / side-line priority model and the four
event types, and replaces sound and browser notifications with a real
bottom-right desktop toast rendered by a resident host process (WPF on Windows,
GTK3 on Linux).

- Mark sessions as main-line (composer ☆, session-row menu); main-line completions
  and failures interrupt immediately, side-line tasks can be pooled into one
  summary, questions and approvals always interrupt.
- Toasts: stacked, color-coded per event, auto-dismiss (4/6/8/12 s), pause on
  hover, click or ✕ to close, height follows content.
- Optional read-only approval-ledger bridge: pending approvals carry a local risk
  prediction; approve / reject / cancel decisions are recorded by
  [dsh-approval-ledger](https://github.com/feely0208/dsh-approval-ledger) but do **not**
  pop a second toast. The settings page shows the ledger connection, recent stats and
  the last five decisions.
- Notification identity contract (issue #1 step 1): each `show()` carries
  `sessionId`, `target`, `sessionIds` and `interactionKey`; the host keeps a bounded
  `id -> target` registry so later click navigation never parses titles or bodies.
- Native click events (issue #1 step 2): GTK/WPF card clicks emit `clicked` then
  `closed reason=click`; the ✕ emits only `closed reason=dismiss`. Node deduplicates
  clicks and drops the target on close. Client navigation arrives in PR 3.
- Install from a tarball (`dsh plugin --profile desktop add <tgz>`); never use
  `link:` for the installed copy.
- MIT. Built on attention-plugins (MIT, © zjbc2000) and inspired by
  dsh-notify-yimit (MIT, © YiMlT); see THIRD-PARTY-NOTICES.md.
