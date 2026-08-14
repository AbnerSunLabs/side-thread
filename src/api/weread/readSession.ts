export const READ_TIME_MAX_RT = 60;
export const READ_TIME_MIN_RT = 1;
export const READ_TIME_TICK_MS = 15_000;
export const READ_TIME_IDLE_MS = 180_000;
export const WEREAD_READER_TOKEN_FALLBACK =
  "3c5c8717f3daf09iop3423zafeqoi";

export type ReadPauseReason = "idle" | "visibility";

export type ReadSession = {
  bookId: string;
  chapterUid: number;
  chapterIdx: number;
  format: string;
  readerToken: string;
  lastTickAt: number;
  lastActivityAt: number;
  unreportedMs: number;
  paused: boolean;
  /** idle 与侧栏隐藏共用 paused，但只有 idle 允许被 ACTIVITY 唤醒 */
  pauseReason: ReadPauseReason | null;
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
  chapterIdx?: number;
  format: string;
  readerToken: string;
  now: number;
}): ReadSession {
  return {
    bookId: input.bookId,
    chapterUid: input.chapterUid,
    chapterIdx: input.chapterIdx ?? 0,
    format: input.format,
    readerToken: input.readerToken,
    lastTickAt: input.now,
    lastActivityAt: input.now,
    unreportedMs: 0,
    paused: false,
    pauseReason: null,
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
  if (session.paused && session.pauseReason === "idle") {
    return resumeSession(session, now);
  }
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
    // 宽限期内仍计时（对齐「挂机约 3 分钟后停止」），超时后不再计入
    const accumulated = accumulateUntil(session, idleAt);
    const flushed = takeReport(accumulated);
    return {
      session: {
        ...flushed.session,
        paused: true,
        pauseReason: "idle",
        lastTickAt: now,
      },
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
    session: {
      ...ticked.session,
      paused: true,
      pauseReason: "visibility",
    },
    reportSeconds: ticked.reportSeconds,
    becameIdle: false,
  };
}

export function resumeSession(session: ReadSession, now: number): ReadSession {
  if (!session.paused) return session;
  return {
    ...session,
    paused: false,
    pauseReason: null,
    lastTickAt: now,
    lastActivityAt: now,
  };
}

export function flushSession(
  session: ReadSession,
  now: number,
): SessionTickResult {
  // flush 是一次性收尾：不走 tickSession 的「满 60 报 60 留余数」周期逻辑，
  // 否则内部 tick 报出的 60s 会被丢弃，导致少报。这里把最后一段直接累计进
  // unreportedMs，再交给 takeReport 一次性 cap 到 60 上报。
  let accumulated = session;
  if (!session.paused) {
    const idleAt = session.lastActivityAt + READ_TIME_IDLE_MS;
    accumulated = accumulateUntil(session, Math.min(now, idleAt));
  }
  const reported = takeReport(accumulated);
  return {
    session: { ...reported.session, lastTickAt: now },
    reportSeconds: reported.reportSeconds,
    becameIdle: false,
  };
}

export type ReadInitResult = {
  succ?: number | boolean | string;
  synckey?: string | number;
  readerToken?: string;
  errCode?: number;
  errMsg?: string;
};

/** 诊断日志：只打字段摘要，不输出 readerToken 原文 */
function summarizeReadApiBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    return { type: typeof body, value: body };
  }
  const rec = body as Record<string, unknown>;
  const token = rec.readerToken;
  return {
    keys: Object.keys(rec),
    succ: rec.succ,
    hasReaderToken: typeof token === "string" && token.length > 0,
    readerTokenLen: typeof token === "string" ? token.length : 0,
    synckey: rec.synckey,
    errCode:
      rec.errCode ?? rec.errcode ?? rec.err_code ?? rec.errorCode ?? rec.code,
    errMsg: rec.errMsg ?? rec.errmsg ?? rec.msg,
  };
}

function isReadApiSuccess(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const rec = body as Record<string, unknown>;
  const errorCode =
    rec.errCode ?? rec.errcode ?? rec.err_code ?? rec.errorCode ?? rec.code;
  if (errorCode != null && Number(errorCode) !== 0) return false;
  const errorMessage = rec.errMsg ?? rec.errmsg ?? rec.errorMessage;
  if (typeof errorMessage === "string" && errorMessage.trim() !== "") {
    return false;
  }
  if (rec.succ != null) {
    return rec.succ === 1 || rec.succ === true || rec.succ === "1";
  }
  return rec.synckey != null;
}

export type ReadReportParams = {
  bookId: string;
  chapterUid: number;
  chapterIdx: number;
  format: string;
  readerToken: string;
  rt: number;
};

export type ReadReportResult = {
  succ?: number | boolean | string;
  synckey?: string | number;
  errCode?: number;
  errMsg?: string;
};

export type WereadLogLevel = "info" | "warn" | "error";

export type WereadLogFn = (
  level: WereadLogLevel,
  message: string,
  data?: unknown,
) => void;

function defaultWereadLog(
  level: WereadLogLevel,
  message: string,
  data?: unknown,
): void {
  const args =
    data === undefined ? [`[Weread] ${message}`] : [`[Weread] ${message}`, data];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.info(...args);
}

export type WereadReadReporterDeps = {
  init: (
    bookId: string,
    chapterUid: number,
    chapterIdx: number,
    format: string,
  ) => Promise<ReadInitResult>;
  report: (params: ReadReportParams) => Promise<ReadReportResult>;
  now?: () => number;
  setIntervalFn?: (
    handler: () => void,
    ms: number,
  ) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
  log?: WereadLogFn;
};

export class WereadReadReporter {
  private session: ReadSession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  /** stop/新 start 会递增，用来丢弃仍在飞行的 init */
  private startGeneration = 0;
  private readonly now: () => number;
  private readonly setIntervalFn: WereadReadReporterDeps["setIntervalFn"];
  private readonly clearIntervalFn: WereadReadReporterDeps["clearIntervalFn"];
  private readonly log: WereadLogFn;

  constructor(private deps: WereadReadReporterDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setIntervalFn = deps.setIntervalFn ?? setInterval;
    this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
    this.log = deps.log ?? defaultWereadLog;
  }

  hasSession(): boolean {
    return this.session !== null;
  }

  markActivity(): void {
    if (!this.session) return;
    const wasIdle = this.session.pauseReason === "idle";
    this.session = markActivity(this.session, this.now());
    if (wasIdle && !this.session.paused) {
      this.ensureTimer();
    }
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
    chapterIdx = 0,
  ): Promise<void> {
    this.log("info", "收到 START", {
      bookId,
      chapterUid,
      chapterIdx,
      format,
    });
    const generation = ++this.startGeneration;
    if (isSameChapter(this.session, bookId, chapterUid)) {
      this.log("info", "同章 START，复用会话");
      this.resume();
      this.markActivity();
      return;
    }
    await this.stopCurrentSession();
    if (generation !== this.startGeneration) return;
    try {
      const initRes = await this.deps.init(
        bookId,
        chapterUid,
        chapterIdx,
        format,
      );
      if (generation !== this.startGeneration) {
        this.log("info", "init 回包已过期，丢弃", {
          bookId,
          chapterUid,
        });
        return;
      }
      const initSummary = summarizeReadApiBody(initRes);
      if (!isReadApiSuccess(initRes)) {
        this.log("error", "阅读会话初始化失败", initSummary);
        return;
      }
      const readerToken =
        initRes.readerToken || WEREAD_READER_TOKEN_FALLBACK;
      this.session = createReadSession({
        bookId,
        chapterUid,
        chapterIdx,
        format,
        readerToken,
        now: this.now(),
      });
      this.ensureTimer();
      this.log("info", "阅读会话已开始", initSummary);
    } catch (error) {
      if (generation !== this.startGeneration) return;
      this.log("error", "阅读会话初始化异常", error);
    }
  }

  async pause(): Promise<void> {
    if (!this.session || this.session.paused) return;
    this.log("info", "侧栏隐藏，暂停计时");
    const result = pauseSession(this.session, this.now());
    this.session = result.session;
    this.clearTimer();
    await this.reportIfNeeded(result);
  }

  async stop(): Promise<void> {
    this.startGeneration += 1;
    await this.stopCurrentSession();
  }

  private async stopCurrentSession(): Promise<void> {
    this.clearTimer();
    if (!this.session) return;
    this.log("info", "会话 STOP，准备 flush");
    const result = flushSession(this.session, this.now());
    this.session = null;
    await this.reportIfNeeded(result);
  }

  private ensureTimer(): void {
    if (this.timer) return;
    // 返回 handleTick 的 Promise：生产环境 setInterval 会忽略返回值，
    // 但测试里可 await intervals[0]() 等待 tick 完整结束（含 finally 复位 ticking）。
    this.timer = this.setIntervalFn!(() => {
      return this.handleTick();
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
      if (this.session.paused) this.clearTimer();
      await this.reportIfNeeded(result);
    } finally {
      this.ticking = false;
    }
  }

  private async reportIfNeeded(result: SessionTickResult): Promise<void> {
    if (!result.reportSeconds) return;
    const snapshot = result.session;
    this.log("info", "准备上报时长", {
      bookId: snapshot.bookId,
      chapterUid: snapshot.chapterUid,
      chapterIdx: snapshot.chapterIdx,
      format: snapshot.format,
      rt: result.reportSeconds,
      becameIdle: result.becameIdle,
    });
    try {
      const reportRes = await this.deps.report({
        bookId: snapshot.bookId,
        chapterUid: snapshot.chapterUid,
        chapterIdx: snapshot.chapterIdx,
        format: snapshot.format,
        readerToken: snapshot.readerToken,
        rt: result.reportSeconds,
      });
      const reportSummary = summarizeReadApiBody(reportRes);
      if (!isReadApiSuccess(reportRes)) {
        this.log("error", "阅读时长上报失败", reportSummary);
        return;
      }
      this.log("info", "阅读时长上报完成", reportSummary);
    } catch (error) {
      this.log("error", "阅读时长上报失败", error);
    }
  }
}
