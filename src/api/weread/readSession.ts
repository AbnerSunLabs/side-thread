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
