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
  // flush 是一次性收尾：不走 tickSession 的「满 60 报 60 留余数」周期逻辑，
  // 否则内部 tick 报出的 60s 会被丢弃，导致少报。这里把最后一段直接累计进
  // unreportedMs，再交给 takeReport 一次性 cap 到 60 上报。
  const accumulated = session.paused ? session : accumulateUntil(session, now);
  const reported = takeReport(accumulated);
  return {
    session: { ...reported.session, lastTickAt: now },
    reportSeconds: reported.reportSeconds,
    becameIdle: false,
  };
}

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
