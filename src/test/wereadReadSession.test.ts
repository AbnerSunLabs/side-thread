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
  WereadReadReporter,
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

  it("idle timeout counts the grace period then stops", () => {
    const started = sessionAt(1_000);
    const active = markActivity(started, 1_000 + 5_000);
    const idle = tickSession(active, 1_000 + 5_000 + READ_TIME_IDLE_MS);
    assert.equal(idle.becameIdle, true);
    assert.equal(idle.session.paused, true);
    assert.equal(idle.session.pauseReason, "idle");
    assert.equal(idle.reportSeconds, 60);
    assert.equal(idle.session.unreportedMs, 0);
    const later = tickSession(
      idle.session,
      1_000 + 5_000 + READ_TIME_IDLE_MS + 60_000,
    );
    assert.equal(later.reportSeconds, null);
    assert.equal(later.session.unreportedMs, 0);
  });

  it("activity after idle resumes counting", () => {
    const started = sessionAt(1_000);
    const idle = tickSession(started, 1_000 + READ_TIME_IDLE_MS);
    const resumed = markActivity(idle.session, 5_000_000);
    assert.equal(resumed.paused, false);
    const ticked = tickSession(resumed, 5_000_000 + 60_000);
    assert.equal(ticked.reportSeconds, 60);
  });

  it("activity after visibility pause does not resume", () => {
    const started = sessionAt(1_000);
    const paused = pauseSession(started, 1_000 + 10_000);
    assert.equal(paused.session.pauseReason, "visibility");
    const active = markActivity(paused.session, 1_000 + 20_000);
    assert.equal(active.paused, true);
    const later = tickSession(active, 1_000 + 80_000);
    assert.equal(later.reportSeconds, null);
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

  it("flush of an unticked 61s session reports 60s once", () => {
    const started = sessionAt(1_000);
    const flushed = flushSession(started, 1_000 + 61_000);
    assert.equal(flushed.reportSeconds, 60);
    assert.equal(flushed.session.unreportedMs, 0);
  });

  it("flush of an idle-but-not-paused session counts grace then caps at 60s", () => {
    const started = sessionAt(1_000);
    const active = markActivity(started, 1_000 + 5_000);
    const flushed = flushSession(
      active,
      1_000 + 5_000 + READ_TIME_IDLE_MS + 60_000,
    );
    assert.equal(flushed.reportSeconds, 60);
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
    const initChapters: number[] = [];
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

  it("pause then resume continues without re-init", async () => {
    let now = 1_000;
    let initCount = 0;
    const reports: number[] = [];
    const reporter = new WereadReadReporter({
      now: () => now,
      init: async () => {
        initCount += 1;
        return { succ: 1, readerToken: "tok" };
      },
      report: async ({ rt }) => {
        reports.push(rt);
        return { succ: 1 };
      },
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
    });
    await reporter.start("b1", 12, "epub");
    now += 40_000;
    await reporter.pause();
    now += 100_000;
    await reporter.resume();
    await reporter.start("b1", 12, "epub");
    assert.equal(initCount, 1);
    now += 30_000;
    await reporter.stop();
    assert.deepEqual(reports, [60]);
  });

  it("report failure does not roll back and next tick reports new seconds", async () => {
    let now = 1_000;
    let failNext = true;
    const reports: number[] = [];
    const intervals: Array<() => void> = [];
    const reporter = new WereadReadReporter({
      now: () => now,
      init: async () => ({ succ: 1, readerToken: "tok" }),
      report: async ({ rt }) => {
        if (failNext) {
          failNext = false;
          throw new Error("network");
        }
        reports.push(rt);
        return { succ: 1 };
      },
      setIntervalFn: handler => {
        intervals.push(handler);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => undefined,
    });
    await reporter.start("b1", 12, "epub");
    now += 75_000;
    await intervals[0]();
    assert.deepEqual(reports, []);
    now += 45_000;
    await intervals[0]();
    assert.deepEqual(reports, [60]);
  });

  it("idle tick pauses session and subsequent stop does not over-report", async () => {
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
      setIntervalFn: handler => {
        intervals.push(handler);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => undefined,
    });
    await reporter.start("b1", 12, "epub");
    now += 5_000;
    await reporter.markActivity();
    now = 6_000 + READ_TIME_IDLE_MS;
    await intervals[0]();
    assert.deepEqual(reports, [60]);
    now += 60_000;
    await reporter.stop();
    assert.deepEqual(reports, [60]);
  });

  it("discards init after stop during in-flight start", async () => {
    let resolveInit!: (value: { succ: number; readerToken: string }) => void;
    let signalInitStarted!: () => void;
    const initStarted = new Promise<void>(resolve => {
      signalInitStarted = resolve;
    });
    const reporter = new WereadReadReporter({
      now: () => 1,
      init: async () => {
        signalInitStarted();
        return new Promise(resolve => {
          resolveInit = resolve;
        });
      },
      report: async () => ({ succ: 1 }),
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
    });

    const startPromise = reporter.start("b1", 12, "epub");
    await initStarted;
    await reporter.stop();
    resolveInit({ succ: 1, readerToken: "tok" });
    await startPromise;
    assert.equal(reporter.hasSession(), false);
  });

  it("activity after idle resume continues reporting", async () => {
    let now = 1_000;
    const reports: number[] = [];
    const intervals: Array<() => void | Promise<void>> = [];
    const reporter = new WereadReadReporter({
      now: () => now,
      init: async () => ({ succ: 1, readerToken: "tok" }),
      report: async ({ rt }) => {
        reports.push(rt);
        return { succ: 1 };
      },
      setIntervalFn: handler => {
        intervals.push(handler);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => undefined,
    });
    await reporter.start("b1", 12, "epub");
    now += READ_TIME_IDLE_MS;
    await intervals[0]();
    assert.deepEqual(reports, [60]);
    now += 10_000;
    reporter.markActivity();
    now += 60_000;
    await reporter.stop();
    assert.deepEqual(reports, [60, 60]);
  });

  it("visibility pause ignores activity until resume", async () => {
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
    now += 10_000;
    await reporter.pause();
    now += 50_000;
    reporter.markActivity();
    now += 60_000;
    await reporter.stop();
    assert.deepEqual(reports, [10]);
  });
});
