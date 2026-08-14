import { useEffect, useRef } from "react";
import { vscode } from "../utils/vscode";

const ACTIVITY_THROTTLE_MS = 5_000;

export function useReadSession(input: {
  enabled: boolean;
  bookId?: string;
  chapterUid?: number;
  chapterIdx?: number;
  format?: string;
}): void {
  const { enabled, bookId, chapterUid, chapterIdx, format } = input;
  const lastActivityAtRef = useRef(0);

  useEffect(() => {
    if (
      !enabled ||
      !bookId ||
      chapterUid == null ||
      chapterIdx == null ||
      !format
    ) {
      if (enabled) {
        vscode.postMessage({
          command: "WEREAD_READ_SESSION_SKIPPED",
          payload: {
            hasBookId: Boolean(bookId),
            chapterUid,
            chapterIdx,
            hasFormat: Boolean(format),
          },
        });
      }
      return;
    }

    vscode.postMessage({
      command: "WEREAD_READ_SESSION_START",
      payload: { bookId, chapterUid, chapterIdx, format },
    });

    return () => {
      vscode.postMessage({ command: "WEREAD_READ_SESSION_STOP" });
    };
  }, [enabled, bookId, chapterUid, chapterIdx, format]);

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
