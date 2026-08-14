# 微信读书阅读时长同步 Implementation Plan

> **状态（2026-08-14）**：已落地，本文是实现前计划，部分规则已过期（例如「只在切章上报固定 60 秒」「空闲只计到最后一次 ACTIVITY」）。现役行为以 [docs/weread-reading-time.md](../../weread-reading-time.md) 和 `src/api/weread/readSession.ts` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让插件内的真实阅读时长按微信读书官方网页规则上报，使微信读书 APP 的「今日阅读时长」能同步累计。

**Architecture:** 阅读时钟与上报会话放在 Extension Host（不被 webview 节流）；Webview 只负责「在读 / 离开 / 有交互」生命周期。Host 每 15 秒 tick，满 60 秒上报一次 `rt`（接口上限 60 秒）；切章、回书架、侧栏隐藏、空闲超时、webview 销毁时 flush 剩余时长。

**Tech Stack:** VS Code WebviewView、现有 `web_book_read` / `web_book_read_init`、Mocha 单测、React hook。不新增 npm 依赖，不改 `package.json`。

## Global Constraints

- 回复、代码注释、commit message description 使用中文。
- 禁止改 `package.json` / `package-lock.json` / `pnpm-lock.yaml`（前端也不新增测试框架）。
- 禁止伪造或膨胀时长：只上报真实累计秒数；单次 `rt` 上限 60；离开时最多再 flush 一次 ≤60 秒，禁止连发补报。
- 不改 Cookie / 登录续期逻辑；上报必须走 `WeReadClient.execute`。
- 不在心跳路径弹「进度已保存」toast。
- 本次不做章内精确进度（`percent` / `chapterOffset` 保持现有 0）、不做插件内时长 UI、不做听书时长。
- 单参数箭头函数写成 `param => expr`。
- 单元测试只加在 `src/test/*.test.ts`，命令：`pnpm compile-tests && pnpm test`。

---

# 第一部分：方案说明（RFC）

## 1. 现状与背景 (Context & Background)

### 业务背景

SideThread 的微信读书模块已经能同步书架和章节进度。用户在插件里读书后，期望微信读书 APP「阅读时长 / 今日读书」一并增加。当前实现把「章节进度」和「时长上报」混在切章请求里，且只在手动切章时固定上报 60 秒，导致 APP 统计几乎看不到插件阅读。

相关代码：

| 文件                                   | 职责                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `src/api/weread/api/book.ts`           | `web_book_read_init` / `web_book_read`，`rt` 注释为最大 60                |
| `src/Providers/wereadProvider.ts`      | 仅在 `WEREAD_GET_CHAPTER` 且 `silent !== true` 时 init + 上报一次 `rt=60` |
| `weread/src/App.tsx`                   | 打开书用 `silent=true` 加载章节；手动切章才非静默                         |
| `src/Providers/baseWebviewProvider.ts` | `onDidChangeVisibility` 只恢复滚动，不处理阅读会话                        |

官方网页阅读的实际上报模型（本方案对齐）：

1. 进入阅读：`POST /web/book/read`（无 `rt`）拿到 `readerToken`
2. 阅读中每隔约 60 秒：同一接口带 `rt`（秒，≤60）、`ts`、`rn`、`sg=sha256(ts+rnd+readerToken)`
3. 离开时把未上报余量再报一次

### 现状描述（当前状态）

| 环节                         | 当前做法                                  | 风险/问题                               |
| ---------------------------- | ----------------------------------------- | --------------------------------------- |
| 打开书                       | `silent=true` 拉章节，不上报              | 只读一章时 APP 时长为 0                 |
| 停留同章阅读                 | 无心跳                                    | 读 30 分钟也只可能在切章时多 1 分钟     |
| 手动切章                     | init + 固定 `rt=60` + toast「进度已保存」 | 时长与真实阅读无关；心跳后 toast 会刷屏 |
| 回书架 / 隐藏侧栏 / 关闭面板 | 无 flush                                  | 最后一段真实时长丢失                    |
| 空闲挂机                     | 无空闲检测                                | 若直接加心跳，会把挂机时间算进去        |

### 对比项（当前状态 vs 理想目标）

| 维度            | 当前状态       | 理想目标                    |
| --------------- | -------------- | --------------------------- |
| 上报时机        | 仅手动切章一次 | 阅读中周期上报 + 离开 flush |
| 上报数值        | 固定 60 秒     | `min(真实累计秒, 60)`       |
| 打开书/静默加载 | 不上报         | 进入阅读器即开会话          |
| 隐藏/空闲       | 未处理         | 暂停累计，不把挂机算进去    |
| 用户感知        | 切章 toast     | 时长上报全程静默            |

## 2. 核心痛点 (Pain Points Analysis)

### 具体场景

- 场景 A：用户今天只在插件里读同一章 40 分钟，从未切章。APP 今日时长不增加。
- 场景 B：用户读了 3 章但每章只停留十几秒。插件每次报 60 秒，APP 可能多出与真实阅读不符的时长，也更容易被服务端风控。
- 场景 C：用户把侧栏切走去写代码，webview 被挂起。若只在 webview 里 `setInterval`，心跳停止或乱跳，时长丢失或不准。

### 量化影响

| 指标                        | 当前现象                  | 影响                   | 估计/假设                      |
| --------------------------- | ------------------------- | ---------------------- | ------------------------------ |
| 插件阅读被 APP 统计到的比例 | 只在手动切章时最多 +60s   | 用户认为「没同步」     | 待量化；同章长读场景约为 0%    |
| 单次上报与真实时长偏差      | 固定 60s vs 实际 0–N 分钟 | 统计失真 / 风控        | 待量化                         |
| 隐藏侧栏后丢失的尾段时长    | 无 flush                  | 每次离开少记最多 59 秒 | 可观测：对比插件会话日志与 APP |

### 优先级（P0）

- P0-1：进入阅读器后必须持续按真实秒数上报，不能再依赖「手动切章」。
- P0-2：时钟必须在 Extension Host，侧栏隐藏/webview 冻结时不能丢会话、不能把挂机算进去。
- P0-3：单次 `rt≤60`，禁止补报膨胀；失败只打日志，不影响阅读。

## 3. 技术方案与指导 (Proposed Solution)

### 设计思路

把「累计了多少未上报毫秒」做成纯函数状态机，便于单测；`WereadReadReporter` 持有定时器和 `readerToken`，由 `WereadProvider` 接线；Webview 只发 4 个命令：开始、停止、暂停、活动。

```
Webview (useReadSession)
  ├─ 进入阅读器 / 章数据到达 / 侧栏重新可见 → START
  ├─ 回书架 / 切书 / pagehide → STOP
  ├─ 滚动/点击（5s 节流）→ ACTIVITY
  └─ document.hidden → 由 Host 的 visibility 统一 PAUSE（Webview 不再单独 STOP，避免冻结丢消息）

WereadProvider
  ├─ START → reporter.start()
  ├─ STOP  → reporter.stop()
  ├─ ACTIVITY → reporter.markActivity()
  ├─ webview 不可见 → reporter.pause()
  ├─ webview 可见 → reporter.resume()（若仍有会话）
  └─ webview dispose → reporter.stop()

WereadReadReporter
  ├─ init: web_book_read_init → readerToken
  ├─ 每 15s tickSession
  │    ├─ 空闲 ≥180s → 只累计到最后一次 ACTIVITY，flush≤60s，paused=true
  │    └─ 未上报 ≥60s → report(60)，减去 60s
  └─ pause/stop → flush 一次 ≤60s
```

### 选型对比

| 方案                                      | 选择理由                                      | 弱点/代价                                   |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| A. Host 时钟 + Webview 生命周期（本方案） | 不被 webview 节流；纯函数可单测；贴近官方心跳 | Provider 稍复杂                             |
| B. 只在 Webview `setInterval`             | 实现快                                        | 侧栏隐藏后定时器被冻，P0-2 失败             |
| C. 切章时按本地停留时间一次性上报         | 改动最小                                      | 同章长读仍为 0；`rt` 仍被 60 截断，长读丢失 |

### 关键规则

| 规则           | 值                                      | 原因                                          |
| -------------- | --------------------------------------- | --------------------------------------------- |
| tick           | 15s                                     | 比 60s 密，隐藏前能把尾段推进 unreported      |
| 上报阈值       | 满 60s 才周期上报                       | 对齐官方；减少请求                            |
| 单次 `rt`      | `floor(ms/1000)` 后 clamp 到 `[1, 60]`  | 接口硬限制                                    |
| 离开 flush     | 只报一次，`rt≤60`                       | 禁止连发补报                                  |
| 空闲           | 180s 无 ACTIVITY                        | 避免挂机刷时长                                |
| 隐藏侧栏       | pause：累计到隐藏时刻并 flush，保留会话 | 回来后 resume，不重新 init（除非 token 失效） |
| 切章           | STOP 旧章 flush + START 新章            | 时长记在对应章节                              |
| 打开书静默加载 | 也 START                                | 修复场景 A                                    |
| toast          | 删除 `WEREAD_SAVE_PROGRESS_SUCCESS`     | 避免心跳误导                                  |
| `pc` / `ps`    | 保持现有假时间戳算法                    | 最小改动；本次不治理                          |
| `pr` / `co`    | 保持 0                                  | 章内进度不在范围内                            |

### 失败策略

- `init.succ !== 1` 或没有 `readerToken`：本次不建会话，`console.error`，阅读不受影响。
- `report` 抛错或 `succ !== 1`：已累计秒数不回滚（避免失败后重复猛报）；等下一 tick 再试。若像鉴权失败，交给现有 `WeReadClient` 续期。
- START 时若已有同一 `bookId+chapterUid` 会话：只 `markActivity` + `resume`，不重复 init。
- START 时若是另一章：先 `stop()` 再 init。

### 实施路线图

**试用期（本次落地）**

- 周期：1 个开发单元（本计划 Task 1–5）
- 交付物：纯函数单测、Reporter 单测、Provider/Webview 接线、README 一句能力说明
- 回滚：还原 `wereadProvider.ts` 切章上报即可回到旧行为；新文件可删

**正式推广**

- 推广条件：手动验收「插件读 3 分钟 → APP 今日时长约 +3 分钟（允许 ±1 分钟）」
- 后续（不在本次）：章内 `percent`/`chapterOffset`、插件内展示今日已同步时长

## 4. 预期收益与验证 (Expected Impact & DOD)

### 收益预测

- 对应 P0-1：同章连续阅读会被 APP 按分钟累计，而不再是 0。
- 对应 P0-2：隐藏侧栏后尾段会 flush；挂机 3 分钟后不再继续加时长。
- 对应 P0-3：单次请求 `rt` 永远 ≤60，不会出现一次报几百秒。

### 验收标准 (Definition of Done)

1. 单元测试：`tick` / 空闲 / pause / flush / 切章 / 同章重复 START 全部通过。
   - 验证：`pnpm compile-tests && pnpm test`
2. 手动：插件阅读器停留 ≥3 分钟（有滚动），微信读书 APP 今日时长增加约 3 分钟（允许 ±1 分钟）。
   - 验证：对比 APP「今日阅读」与操作墙钟。
3. 负向：打开书后切到书架挂机 5 分钟，APP 时长不再继续涨。
   - 验证：回书架后看 APP，等待 5 分钟再看，增量停止。

---

# 第二部分：文件与接口锁定

## 文件结构

| 路径                                 | 动作 | 职责                                     |
| ------------------------------------ | ---- | ---------------------------------------- |
| `src/api/weread/readSession.ts`      | 新建 | 纯函数时钟 + `WereadReadReporter`        |
| `src/test/wereadReadSession.test.ts` | 新建 | 上述单测                                 |
| `src/Providers/wereadProvider.ts`    | 修改 | 接线会话；删除切章一次性上报             |
| `weread/src/hooks/useReadSession.ts` | 新建 | Webview 生命周期与 ACTIVITY              |
| `weread/src/App.tsx`                 | 修改 | 调用 hook；去掉对保存 toast 的依赖       |
| `README.md`                          | 修改 | 能力从「进度云同步」补上「阅读时长同步」 |

不新建消息类型文件，沿用现有 `{ command, payload }`。

## 消息契约

Webview → Host：

```ts
{
  command: "WEREAD_READ_SESSION_START";
  payload: {
    bookId: string;
    chapterUid: number;
    format: string;
  }
}
{
  command: "WEREAD_READ_SESSION_STOP";
}
{
  command: "WEREAD_READ_ACTIVITY";
}
```

Host 不回 toast。失败只 `console.error`。

可见性不走消息：Provider 直接听 `webviewView.onDidChangeVisibility`。

## 纯函数接口（后续任务必须使用这些名字）

```ts
export const READ_TIME_MAX_RT = 60;
export const READ_TIME_MIN_RT = 1;
export const READ_TIME_TICK_MS = 15_000;
export const READ_TIME_IDLE_MS = 180_000;

export type ReadSession = {
  bookId: string;
  chapterUid: number;
  format: string;
  readerToken: string;
  lastTickAt: number;
  lastActivityAt: number;
  unreportedMs: number;
  paused: boolean;
};

export type SessionTickResult = {
  session: ReadSession;
  reportSeconds: number | null;
  becameIdle: boolean;
};

export function capRt(seconds: number): number;
export function createReadSession(input: {
  bookId: string;
  chapterUid: number;
  format: string;
  readerToken: string;
  now: number;
}): ReadSession;
export function isSameChapter(
  session: ReadSession | null,
  bookId: string,
  chapterUid: number,
): boolean;
export function markActivity(session: ReadSession, now: number): ReadSession;
export function tickSession(
  session: ReadSession,
  now: number,
): SessionTickResult;
export function pauseSession(
  session: ReadSession,
  now: number,
): SessionTickResult;
export function resumeSession(session: ReadSession, now: number): ReadSession;
export function flushSession(
  session: ReadSession,
  now: number,
): SessionTickResult;
```

`WereadReadReporter` 接口：

```ts
export type ReadInitResult = { succ?: number; readerToken?: string };
export type ReadReportParams = {
  bookId: string;
  chapterUid: number;
  format: string;
  readerToken: string;
  rt: number;
};
export type WereadReadReporterDeps = {
  init: (
    bookId: string,
    chapterUid: number,
    format: string,
  ) => Promise<ReadInitResult>;
  report: (params: ReadReportParams) => Promise<{ succ?: number }>;
  now?: () => number;
  setIntervalFn?: (
    handler: () => void,
    ms: number,
  ) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
};

export class WereadReadReporter {
  constructor(deps: WereadReadReporterDeps);
  start(bookId: string, chapterUid: number, format: string): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): void;
  markActivity(): void;
  hasSession(): boolean;
}
```

---

# 第三部分：任务拆解

### Task 1: 阅读时钟纯函数

**Files:**

- Create: `src/api/weread/readSession.ts`（本任务只实现纯函数，先不写 class）
- Test: `src/test/wereadReadSession.test.ts`

**Interfaces:**

- Consumes: 无
- Produces: 上一节「纯函数接口」全部符号

- [ ] **Step 1: 写失败单测**

创建 `src/test/wereadReadSession.test.ts`：

```ts
import * as assert from "assert";
import { describe, it } from "mocha";
import {
  capRt,
  createReadSession,
  flushSession,
  isSameChapter,
  markActivity,
  pauseSession,
  READ_TIME_IDLE_MS,
  resumeSession,
  tickSession,
} from "../api/weread/readSession";

function sessionAt(now: number) {
  return createReadSession({
    bookId: "b1",
    chapterUid: 12,
    format: "epub",
    readerToken: "token",
    now,
  });
}

describe("weread readSession", () => {
  it("capRt clamps to 0–60 and drops sub-second values", () => {
    assert.equal(capRt(0.9), 0);
    assert.equal(capRt(1), 1);
    assert.equal(capRt(59.9), 59);
    assert.equal(capRt(60), 60);
    assert.equal(capRt(120), 60);
    assert.equal(capRt(Number.NaN), 0);
  });

  it("does not report before 60 seconds of active reading", () => {
    const started = sessionAt(1_000);
    const result = tickSession(started, 1_000 + 59_000);
    assert.equal(result.reportSeconds, null);
    assert.equal(result.session.unreportedMs, 59_000);
    assert.equal(result.becameIdle, false);
  });

  it("reports exactly 60 seconds and keeps the remainder", () => {
    const started = sessionAt(1_000);
    const result = tickSession(started, 1_000 + 75_000);
    assert.equal(result.reportSeconds, 60);
    assert.equal(result.session.unreportedMs, 15_000);
    assert.equal(result.session.lastTickAt, 1_000 + 75_000);
  });

  it("paused session does not accumulate", () => {
    const started = sessionAt(1_000);
    const paused = pauseSession(started, 1_000 + 10_000);
    const later = tickSession(paused.session, 1_000 + 80_000);
    assert.equal(later.reportSeconds, null);
    assert.equal(later.session.unreportedMs, paused.session.unreportedMs);
  });

  it("idle timeout stops accumulating at last activity and flushes at most 60s", () => {
    const started = sessionAt(1_000);
    const active = markActivity(started, 1_000 + 5_000);
    const idle = tickSession(active, 1_000 + 5_000 + READ_TIME_IDLE_MS);
    assert.equal(idle.becameIdle, true);
    assert.equal(idle.session.paused, true);
    assert.ok((idle.reportSeconds ?? 0) <= 60);
    const leftover = idle.session.unreportedMs;
    const later = tickSession(
      idle.session,
      1_000 + 5_000 + READ_TIME_IDLE_MS + 60_000,
    );
    assert.equal(later.reportSeconds, null);
    assert.equal(later.session.unreportedMs, leftover);
  });

  it("flush reports remaining seconds once and clears unreportedMs", () => {
    const started = sessionAt(1_000);
    const ticked = tickSession(started, 1_000 + 40_000);
    const flushed = flushSession(ticked.session, 1_000 + 40_000);
    assert.equal(flushed.reportSeconds, 40);
    assert.equal(flushed.session.unreportedMs, 0);
  });

  it("flush of 90s active time only reports 60s and drops the rest", () => {
    const started = sessionAt(1_000);
    const ticked = tickSession(started, 1_000 + 90_000);
    // tick 已先报 60，剩余 30
    const flushed = flushSession(ticked.session, 1_000 + 90_000);
    assert.equal(ticked.reportSeconds, 60);
    assert.equal(flushed.reportSeconds, 30);
    assert.equal(flushed.session.unreportedMs, 0);
  });

  it("resume continues from the resume timestamp", () => {
    const started = sessionAt(1_000);
    const paused = pauseSession(started, 1_000 + 10_000);
    const resumed = resumeSession(paused.session, 5_000_000);
    const ticked = tickSession(resumed, 5_000_000 + 60_000);
    assert.equal(ticked.reportSeconds, 60);
  });

  it("isSameChapter compares bookId and chapterUid", () => {
    const started = sessionAt(1);
    assert.equal(isSameChapter(started, "b1", 12), true);
    assert.equal(isSameChapter(started, "b1", 13), false);
    assert.equal(isSameChapter(null, "b1", 12), false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm compile-tests && pnpm test`

Expected: FAIL，找不到 `../api/weread/readSession` 或导出。

- [ ] **Step 3: 实现纯函数**

创建 `src/api/weread/readSession.ts`：

```ts
export const READ_TIME_MAX_RT = 60;
export const READ_TIME_MIN_RT = 1;
export const READ_TIME_TICK_MS = 15_000;
export const READ_TIME_IDLE_MS = 180_000;

export type ReadSession = {
  bookId: string;
  chapterUid: number;
  format: string;
  readerToken: string;
  lastTickAt: number;
  lastActivityAt: number;
  unreportedMs: number;
  paused: boolean;
};

export type SessionTickResult = {
  session: ReadSession;
  reportSeconds: number | null;
  becameIdle: boolean;
};

export function capRt(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < READ_TIME_MIN_RT) return 0;
  return Math.min(Math.floor(seconds), READ_TIME_MAX_RT);
}

export function createReadSession(input: {
  bookId: string;
  chapterUid: number;
  format: string;
  readerToken: string;
  now: number;
}): ReadSession {
  return {
    bookId: input.bookId,
    chapterUid: input.chapterUid,
    format: input.format,
    readerToken: input.readerToken,
    lastTickAt: input.now,
    lastActivityAt: input.now,
    unreportedMs: 0,
    paused: false,
  };
}

export function isSameChapter(
  session: ReadSession | null,
  bookId: string,
  chapterUid: number,
): boolean {
  return (
    !!session && session.bookId === bookId && session.chapterUid === chapterUid
  );
}

export function markActivity(session: ReadSession, now: number): ReadSession {
  return { ...session, lastActivityAt: now };
}

function takeReport(session: ReadSession): SessionTickResult {
  const reportSeconds = capRt(session.unreportedMs / 1000);
  if (reportSeconds <= 0) {
    return { session, reportSeconds: null, becameIdle: false };
  }
  return {
    session: {
      ...session,
      unreportedMs: 0,
    },
    reportSeconds,
    becameIdle: false,
  };
}

function accumulateUntil(session: ReadSession, until: number): ReadSession {
  const elapsed = Math.max(0, until - session.lastTickAt);
  return {
    ...session,
    lastTickAt: until,
    unreportedMs: session.unreportedMs + elapsed,
  };
}

export function tickSession(
  session: ReadSession,
  now: number,
): SessionTickResult {
  if (session.paused || now <= session.lastTickAt) {
    return { session, reportSeconds: null, becameIdle: false };
  }

  const idleAt = session.lastActivityAt + READ_TIME_IDLE_MS;
  if (now >= idleAt) {
    const accumulated = accumulateUntil(
      session,
      Math.max(session.lastTickAt, session.lastActivityAt),
    );
    const flushed = takeReport(accumulated);
    return {
      session: { ...flushed.session, paused: true, lastTickAt: now },
      reportSeconds: flushed.reportSeconds,
      becameIdle: true,
    };
  }

  const accumulated = accumulateUntil(session, now);
  if (accumulated.unreportedMs < READ_TIME_MAX_RT * 1000) {
    return { session: accumulated, reportSeconds: null, becameIdle: false };
  }

  const reportSeconds = READ_TIME_MAX_RT;
  return {
    session: {
      ...accumulated,
      unreportedMs: accumulated.unreportedMs - reportSeconds * 1000,
    },
    reportSeconds,
    becameIdle: false,
  };
}

export function pauseSession(
  session: ReadSession,
  now: number,
): SessionTickResult {
  if (session.paused) {
    return { session, reportSeconds: null, becameIdle: false };
  }
  const ticked = tickSession({ ...session, lastActivityAt: now }, now);
  return {
    session: { ...ticked.session, paused: true },
    reportSeconds: ticked.reportSeconds,
    becameIdle: false,
  };
}

export function resumeSession(session: ReadSession, now: number): ReadSession {
  if (!session.paused) return session;
  return {
    ...session,
    paused: false,
    lastTickAt: now,
    lastActivityAt: now,
  };
}

export function flushSession(
  session: ReadSession,
  now: number,
): SessionTickResult {
  const ticked = session.paused
    ? { session, reportSeconds: null, becameIdle: false }
    : tickSession(session, now);
  const reported = takeReport(ticked.session);
  return {
    session: { ...reported.session, lastTickAt: now },
    reportSeconds: reported.reportSeconds,
    becameIdle: false,
  };
}
```

注意：`takeReport` 在周期 tick 满 60s 时**不要**用（周期路径要保留 remainder）。只有 idle/flush 才把 `unreportedMs` 一次性 cap 后清零——这保证「90s 离开」最多再报 30s，而不会把余数留着下次连发。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm compile-tests && pnpm test`

Expected: `weread readSession` 全部 PASS。若 idle 用例因「累计到 lastActivityAt 还是 idleAt」失败，以测试为准改 `tickSession`：空闲时只累计到 `lastActivityAt`，不要把 180s 挂机算进去。

- [ ] **Step 5: Commit**

```bash
git add src/api/weread/readSession.ts src/test/wereadReadSession.test.ts
git commit -m "$(cat <<'EOF'
feat: 新增微信读书阅读时长时钟纯函数

EOF
)"
```

---

### Task 2: WereadReadReporter

**Files:**

- Modify: `src/api/weread/readSession.ts`（追加 class，不要改 Task 1 已通过的纯函数语义）
- Test: `src/test/wereadReadSession.test.ts`（追加 describe）

**Interfaces:**

- Consumes: Task 1 纯函数
- Produces: `WereadReadReporter`、`WereadReadReporterDeps`、`ReadInitResult`、`ReadReportParams`

- [ ] **Step 1: 写失败单测（追加到同一测试文件）**

```ts
import { WereadReadReporter } from "../api/weread/readSession";

describe("WereadReadReporter", () => {
  it("inits once and reports 60s after 75s of active time", async () => {
    let now = 1_000;
    const reports: number[] = [];
    const intervals: Array<() => void> = [];
    const reporter = new WereadReadReporter({
      now: () => now,
      init: async () => ({ succ: 1, readerToken: "tok" }),
      report: async ({ rt }) => {
        reports.push(rt);
        return { succ: 1 };
      },
      setIntervalFn: (handler) => {
        intervals.push(handler);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => undefined,
    });

    await reporter.start("b1", 12, "epub");
    now += 75_000;
    await intervals[0]();
    assert.deepEqual(reports, [60]);
  });

  it("same chapter start does not init twice", async () => {
    let initCount = 0;
    const reporter = new WereadReadReporter({
      now: () => 1,
      init: async () => {
        initCount += 1;
        return { succ: 1, readerToken: "tok" };
      },
      report: async () => ({ succ: 1 }),
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
    });
    await reporter.start("b1", 12, "epub");
    await reporter.start("b1", 12, "epub");
    assert.equal(initCount, 1);
  });

  it("switching chapter flushes the previous session once then inits the new one", async () => {
    let now = 1_000;
    const reports: Array<{ chapterUid: number; rt: number }> = [];
    let initChapters: number[] = [];
    const reporter = new WereadReadReporter({
      now: () => now,
      init: async (_bookId, chapterUid) => {
        initChapters.push(chapterUid);
        return { succ: 1, readerToken: "tok" };
      },
      report: async ({ chapterUid, rt }) => {
        reports.push({ chapterUid, rt });
        return { succ: 1 };
      },
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
    });

    await reporter.start("b1", 1, "epub");
    now += 40_000;
    await reporter.start("b1", 2, "epub");
    assert.deepEqual(initChapters, [1, 2]);
    assert.deepEqual(reports, [{ chapterUid: 1, rt: 40 }]);
  });

  it("stop after 40s reports 40s once", async () => {
    let now = 1_000;
    const reports: number[] = [];
    const reporter = new WereadReadReporter({
      now: () => now,
      init: async () => ({ succ: 1, readerToken: "tok" }),
      report: async ({ rt }) => {
        reports.push(rt);
        return { succ: 1 };
      },
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
    });
    await reporter.start("b1", 12, "epub");
    now += 40_000;
    await reporter.stop();
    assert.deepEqual(reports, [40]);
    assert.equal(reporter.hasSession(), false);
  });

  it("init failure does not start a session", async () => {
    const reporter = new WereadReadReporter({
      now: () => 1,
      init: async () => ({ succ: 0 }),
      report: async () => ({ succ: 1 }),
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
    });
    await reporter.start("b1", 12, "epub");
    assert.equal(reporter.hasSession(), false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm compile-tests && pnpm test`

Expected: FAIL，`WereadReadReporter` 未导出。

- [ ] **Step 3: 在 `readSession.ts` 末尾追加 class**

实现要点（必须遵守）：

1. `this.session` 仅在 init 成功且有 `readerToken` 后赋值。
2. `start`：同章则 `resume` + `markActivity`；异章则 `await this.stop()` 再 init。
3. 定时器只在会话存在时启动一份，`READ_TIME_TICK_MS`。
4. `handleTick` / `pause` / `stop` 共用 `this.reportIfNeeded(result)`：`reportSeconds` 为 null 则 return；调用 `deps.report`；失败 `console.error`，不把秒数加回（避免猛报）。
5. `stop` 后 `clearInterval` 并把 `this.session = null`。
6. `pause` 在无会话或已 paused 时直接 return。
7. `resume` 无会话则忽略。
8. `markActivity` 在 paused 会话上**不要**自动 resume（隐藏侧栏时可能仍有滚动事件）；resume 只由 Provider 在 visible=true 时调用。

参考实现：

```ts
export type ReadInitResult = { succ?: number; readerToken?: string };

export type ReadReportParams = {
  bookId: string;
  chapterUid: number;
  format: string;
  readerToken: string;
  rt: number;
};

export type WereadReadReporterDeps = {
  init: (
    bookId: string,
    chapterUid: number,
    format: string,
  ) => Promise<ReadInitResult>;
  report: (params: ReadReportParams) => Promise<{ succ?: number }>;
  now?: () => number;
  setIntervalFn?: (
    handler: () => void,
    ms: number,
  ) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
};

export class WereadReadReporter {
  private session: ReadSession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly now: () => number;
  private readonly setIntervalFn: WereadReadReporterDeps["setIntervalFn"];
  private readonly clearIntervalFn: WereadReadReporterDeps["clearIntervalFn"];

  constructor(private deps: WereadReadReporterDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setIntervalFn = deps.setIntervalFn ?? setInterval;
    this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  }

  hasSession(): boolean {
    return this.session !== null;
  }

  markActivity(): void {
    if (!this.session) return;
    this.session = markActivity(this.session, this.now());
  }

  resume(): void {
    if (!this.session) return;
    this.session = resumeSession(this.session, this.now());
    this.ensureTimer();
  }

  async start(
    bookId: string,
    chapterUid: number,
    format: string,
  ): Promise<void> {
    if (isSameChapter(this.session, bookId, chapterUid)) {
      this.resume();
      this.markActivity();
      return;
    }
    await this.stop();
    try {
      const initRes = await this.deps.init(bookId, chapterUid, format);
      if (initRes?.succ !== 1 || !initRes.readerToken) {
        console.error("[Weread] 阅读会话初始化失败", initRes);
        return;
      }
      this.session = createReadSession({
        bookId,
        chapterUid,
        format,
        readerToken: initRes.readerToken,
        now: this.now(),
      });
      this.ensureTimer();
    } catch (error) {
      console.error("[Weread] 阅读会话初始化异常", error);
    }
  }

  async pause(): Promise<void> {
    if (!this.session || this.session.paused) return;
    const result = pauseSession(this.session, this.now());
    this.session = result.session;
    await this.reportIfNeeded(result);
  }

  async stop(): Promise<void> {
    this.clearTimer();
    if (!this.session) return;
    const result = flushSession(this.session, this.now());
    this.session = null;
    await this.reportIfNeeded(result);
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = this.setIntervalFn!(() => {
      void this.handleTick();
    }, READ_TIME_TICK_MS);
  }

  private clearTimer(): void {
    if (!this.timer) return;
    this.clearIntervalFn!(this.timer);
    this.timer = null;
  }

  private async handleTick(): Promise<void> {
    if (!this.session || this.ticking) return;
    this.ticking = true;
    try {
      const result = tickSession(this.session, this.now());
      this.session = result.session;
      await this.reportIfNeeded(result);
    } finally {
      this.ticking = false;
    }
  }

  private async reportIfNeeded(result: SessionTickResult): Promise<void> {
    if (
      !result.reportSeconds ||
      (!this.session && !result.session.readerToken)
    ) {
      // stop() 已把 this.session 置空，flush 仍需用 result.session 上报
    }
    if (!result.reportSeconds) return;
    const snapshot = result.session;
    try {
      await this.deps.report({
        bookId: snapshot.bookId,
        chapterUid: snapshot.chapterUid,
        format: snapshot.format,
        readerToken: snapshot.readerToken,
        rt: result.reportSeconds,
      });
    } catch (error) {
      console.error("[Weread] 阅读时长上报失败", error);
    }
  }
}
```

实现时删掉 `reportIfNeeded` 里无用的空 if，保留「无 reportSeconds 则 return；用 `result.session` 上报」。`stop()` 必须在清 `this.session` **之前或同时**用 `result.session` 上报，不能依赖 `this.session`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm compile-tests && pnpm test`

Expected: 新旧 weread 测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/api/weread/readSession.ts src/test/wereadReadSession.test.ts
git commit -m "$(cat <<'EOF'
feat: 新增微信读书阅读时长上报会话

EOF
)"
```

---

### Task 3: Provider 接线并删除切章一次性上报

**Files:**

- Modify: `src/Providers/wereadProvider.ts`

**Interfaces:**

- Consumes: `WereadReadReporter`
- Produces: 处理 `WEREAD_READ_SESSION_START` / `STOP` / `ACTIVITY`；可见性 pause/resume；dispose stop

- [ ] **Step 1: 在 `WereadProvider` 内构造 reporter**

在 `wereadProvider.ts` 增加 import：

```ts
import { WereadReadReporter } from "../api/weread/readSession";
```

在 constructor 里 `this.client` 赋值之后：

```ts
this.readReporter = new WereadReadReporter({
  init: async (bookId, chapterUid, format) => {
    const now = Math.floor(Date.now() / 1000);
    const pc = now - 10;
    const ps = pc - Math.floor(Math.random() * 5) - 5;
    return this.client.execute(
      web_book_read_init,
      bookId,
      chapterUid,
      0,
      0,
      pc,
      ps,
      format,
    );
  },
  report: async ({ bookId, chapterUid, format, readerToken, rt }) => {
    const now = Math.floor(Date.now() / 1000);
    const pc = now - 10;
    const ps = pc - Math.floor(Math.random() * 5) - 5;
    return this.client.execute(
      web_book_read,
      bookId,
      chapterUid,
      0,
      0,
      pc,
      ps,
      format,
      readerToken,
      rt,
    );
  },
});
```

类字段：`private readReporter: WereadReadReporter;`

- [ ] **Step 2: 覆盖可见性与销毁**

`resolveWebviewView` 在 `super.resolveWebviewView` 之后追加（必须在 super 之后，以免丢基类监听）：

```ts
public override resolveWebviewView(webviewView: WebviewView) {
  this.webviewView = webviewView;
  const resolved = super.resolveWebviewView(webviewView);
  webviewView.onDidChangeVisibility(() => {
    if (webviewView.visible) {
      this.readReporter.resume();
      return;
    }
    void this.readReporter.pause();
  });
  webviewView.onDidDispose(() => {
    void this.readReporter.stop();
    this.webviewView = null;
  });
  return resolved;
}
```

- [ ] **Step 3: 处理新消息，并拆掉 GET_CHAPTER 里的上报**

`WEREAD_GET_CHAPTER` 只拉正文，**删除** `if (!silent) { ... web_book_read_init / web_book_read / WEREAD_SAVE_PROGRESS_SUCCESS }` 整段。

在 switch 增加：

```ts
case "WEREAD_READ_SESSION_START": {
  const { bookId, chapterUid, format } = payload || {};
  if (!bookId || chapterUid == null) break;
  await this.readReporter.start(bookId, chapterUid, format || "epub");
  break;
}
case "WEREAD_READ_SESSION_STOP": {
  await this.readReporter.stop();
  break;
}
case "WEREAD_READ_ACTIVITY": {
  this.readReporter.markActivity();
  break;
}
```

`web_book_read_init` / `web_book_read` 仍保留 import，供 reporter 使用。

- [ ] **Step 4: 编译**

Run: `pnpm compile-tests && pnpm lint && pnpm test`

Expected: PASS，无 lint 错误。

- [ ] **Step 5: Commit**

```bash
git add src/Providers/wereadProvider.ts
git commit -m "$(cat <<'EOF'
feat: 微信读书 Host 侧接入阅读时长会话

EOF
)"
```

---

### Task 4: Webview 生命周期 hook

**Files:**

- Create: `weread/src/hooks/useReadSession.ts`
- Modify: `weread/src/App.tsx`

**Interfaces:**

- Consumes: 消息契约
- Produces: 阅读器可见时 START；离开 STOP；滚动/点击 ACTIVITY（5s 节流）

weread 包没有单测框架，本任务验收 = `pnpm --filter weread build` 通过 + 对照下面行为清单。

- [ ] **Step 1: 新建 hook**

```tsx
import { useEffect, useRef } from "react";
import { vscode } from "../utils/vscode";

const ACTIVITY_THROTTLE_MS = 5_000;

export function useReadSession(input: {
  enabled: boolean;
  bookId?: string;
  chapterUid?: number;
  format?: string;
}): void {
  const { enabled, bookId, chapterUid, format } = input;
  const lastActivityAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !bookId || chapterUid == null || !format) return;

    vscode.postMessage({
      command: "WEREAD_READ_SESSION_START",
      payload: { bookId, chapterUid, format },
    });

    return () => {
      vscode.postMessage({ command: "WEREAD_READ_SESSION_STOP" });
    };
  }, [enabled, bookId, chapterUid, format]);

  useEffect(() => {
    if (!enabled) return;

    const emitActivity = () => {
      const now = Date.now();
      if (now - lastActivityAtRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityAtRef.current = now;
      vscode.postMessage({ command: "WEREAD_READ_ACTIVITY" });
    };

    const contentEl = document.querySelector(".reader-content");
    contentEl?.addEventListener("scroll", emitActivity, { passive: true });
    window.addEventListener("click", emitActivity);
    window.addEventListener("keydown", emitActivity);

    return () => {
      contentEl?.removeEventListener("scroll", emitActivity);
      window.removeEventListener("click", emitActivity);
      window.removeEventListener("keydown", emitActivity);
    };
  }, [enabled, chapterUid]);
}
```

说明：侧栏隐藏时 Webview 可能被冻住，STOP 不一定能发出。隐藏/恢复以 Task 3 的 `onDidChangeVisibility` 为准。hook 的 cleanup STOP 覆盖「回书架 / 切章 / 切书」。

切章时 React 会先 cleanup（STOP 旧章）再 START 新章，与 Reporter「异章 stop + init」一致；即使 START 先到，Reporter 也会先 stop 旧会话。

- [ ] **Step 2: 接入 App.tsx**

1. `import { useReadSession } from "./hooks/useReadSession";`
2. 在 `App` 组件内、`currentChapterUidRef` 相关 effect 附近调用：

```ts
useReadSession({
  enabled: view === "reader" && !loading && !!chapterContent,
  bookId: currentBook?.bookId,
  chapterUid: catalog[currentChapterIdx]?.chapterUid,
  format: chapterContent?.format,
});
```

`loading && !!chapterContent`：等本章 HTML 到达再 START，避免把拉章等待算进时长。切章 loading 期间 hook `enabled` 变 false，会 STOP 旧章并 flush。

3. 删除 `case "WEREAD_SAVE_PROGRESS_SUCCESS"` 分支（Host 已不再发送）。

不要改 `loadChapterWithBookId` 的 `silent` 参数语义——它不再影响上报。

- [ ] **Step 3: 构建前端**

Run: `pnpm --filter weread build`

Expected: `tsc -b && vite build` 成功。

- [ ] **Step 4: Commit**

```bash
git add weread/src/hooks/useReadSession.ts weread/src/App.tsx
git commit -m "$(cat <<'EOF'
feat: 微信读书阅读器按真实阅读生命周期上报时长

EOF
)"
```

---

### Task 5: README 与手动验收

**Files:**

- Modify: `README.md`

- [ ] **Step 1: 更新能力描述**

把：

```
支持 **书架同步、阅读进度云同步、章节目录导航、划线笔记查看**
```

改成：

```
支持 **书架同步、阅读进度云同步、阅读时长同步到微信读书账号、章节目录导航、划线笔记查看**
```

- [ ] **Step 2: 按下面清单手动验一次（实现者执行，不要跳过）**

| 编号 | 操作                                     | 期望                                                                           |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| M1   | 打开一书，同章连续阅读 ≥3 分钟，期间滚动 | 开发者工具/`console` 大约每 60s 有一次 `web_book_read`；APP 今日时长约 +3 分钟 |
| M2   | 阅读中切章                               | 旧章 flush 一次 ≤60s，新章重新 init                                            |
| M3   | 回书架后等待 5 分钟                      | APP 时长停止增加                                                               |
| M4   | 阅读中把微信读书侧栏切走 ≥1 分钟再回来   | 切走时 pause/flush；回来后继续累计，不把离开期间算进去                         |
| M5   | 打开阅读器后完全不操作挂机 4 分钟        | 约 3 分钟后停止累计（空闲 180s）                                               |
| M6   | 未登录 / Cookie 失效                     | 阅读仍可用，控制台有初始化失败日志，不弹 toast                                 |

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: 补充微信读书阅读时长同步说明

EOF
)"
```

---

# 第四部分：自检

## Spec coverage

| 需求                          | 任务                                  |
| ----------------------------- | ------------------------------------- |
| 真实秒数周期上报              | Task 1 tick + Task 2 report 60        |
| Host 时钟，隐藏不丢、挂机不计 | Task 1 idle/pause + Task 3 visibility |
| `rt≤60`、离开只 flush 一次    | Task 1 flush + Task 2 stop            |
| 打开书静默加载也开会话        | Task 4 enabled 在 reader+正文到达     |
| 去掉切章固定 60s 和 toast     | Task 3 删除 GET_CHAPTER 上报          |
| 不改 package.json             | 全局约束                              |
| APP 可观察到时长              | Task 5 M1                             |

## Placeholder scan

无 TBD /「稍后实现」/「补充错误处理」空话；失败路径已写明 log 且不回滚秒数。

## Type consistency

全程使用 `ReadSession`、`WereadReadReporter`、`WEREAD_READ_SESSION_START` / `STOP` / `ACTIVITY`。不要自创 `heartbeat` / `keeptime` 等第二套命名。
