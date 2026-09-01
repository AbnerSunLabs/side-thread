import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Spin,
  Empty,
  Button,
  FloatButton,
  Drawer,
  Popover,
  App as AntdApp,
} from "antd";
import {
  LeftOutlined,
  ReloadOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  PlusOutlined,
  MinusOutlined,
  VerticalAlignTopOutlined,
  UnorderedListOutlined,
  LikeFilled,
  LikeOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import {
  applyLikeToggle,
  isMatchingThoughtRequest,
  parseHotThoughts,
  parseThoughtRequestId,
  ThoughtVisibility,
} from "core-weread/wereadThoughts";
import { mergeUnderlineRanges, reviewRangesForClickedUnderline, sameChapterUid } from "core-weread/wereadBookmarks";
import {
  displayedThoughtHtml,
  prepareThoughtRangeHtml,
  resolveDisplayedThoughtRange,
  stripChapterWrappers,
} from "core-weread/wereadHtmlRange";
import { injectUnderlines } from "core-weread/wereadUnderlineInject";
import { overlayPosInScroller } from "core-weread/wereadOverlayPos";
import {
  CatalogChapter,
  CatalogTocRow,
  flattenCatalogToc,
  parseCatalogChapters,
} from "core-weread/wereadCatalog";
import { ThoughtComposer } from "./components/ThoughtComposer";
import { vscode } from "./utils/vscode";
import { useReadSession } from "./hooks/useReadSession";
import { useFontSizeStore } from "./store/fontSize";
import "./style/App.less";
import "./style/thoughts.less";

interface Book {
  bookId: string;
  title: string;
  cover: string;
  readUpdateTime?: number;
}

interface ChapterContent {
  html: string;
  style: string;
  format: string;
}

interface Thought {
  reviewId: string;
  abstract: string;
  content: string;
  user: {
    name: string;
    avatar: string;
  };
  range?: string;
  chapterUid?: number;
  likeCount?: number;
  liked: boolean;
}

interface Underline {
  range: string;
  count: number;
  type: number;
}

function thoughtFromAddResult(
  payload: unknown,
  fallback: { content: string; abstract: string },
): Thought {
  const row = (payload ?? {}) as {
    review?: {
      reviewId?: string;
      abstract?: string;
      content?: string;
      author?: { name?: string; avatar?: string };
      review?: {
        reviewId?: string;
        abstract?: string;
        content?: string;
        author?: { name?: string; avatar?: string };
      };
    };
  };
  const review = row.review?.review ?? row.review ?? {};
  const author = review.author ?? {};
  return {
    reviewId: review.reviewId ?? "",
    abstract: review.abstract ?? fallback.abstract,
    content: review.content || fallback.content,
    user: {
      name: author.name ?? "",
      avatar: author.avatar ?? "",
    },
    liked: false,
    likeCount: 0,
  };
}

function parseChapterIdx(value: unknown): number | undefined {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function textOffsetsInRoot(
  root: HTMLElement,
  selection: Selection,
): {
  start: number;
  end: number;
  text: string;
} | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const text = range.toString();
  if (!text.trim()) return null;
  return { start, end: start + text.length, text };
}

function decodeChapterHtml(html: string): string {
  if (!html.includes("&lt;")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.documentElement.textContent || html;
}

function chapterRangeHtml(content: ChapterContent): string {
  return prepareThoughtRangeHtml(decodeChapterHtml(content.html), content.format);
}

function replaceFootnotes(raw: string): string {
  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const imgFootnotes = doc.querySelectorAll("img.qqreader-footnote");
    imgFootnotes.forEach(img => {
      const noteText =
        img.getAttribute("alt") || img.getAttribute("title") || "";
      const span = doc.createElement("span");
      span.className = "weread-footnote-wrapper";
      span.setAttribute("data-note", noteText);

      const iconSpan = doc.createElement("span");
      iconSpan.className = "weread-footnote-icon";
      span.appendChild(iconSpan);

      img.parentNode?.replaceChild(span, img);
    });
    return doc.body.innerHTML;
  } catch (e) {
    console.error("[Weread] Failed to parse and replace footnotes:", e);
    return raw;
  }
}

/** 与 `.xhtml-content` 相同：strip / TXT 包 p，注入划线 span 之前。 */
function chapterDisplayHtml(content: ChapterContent): string {
  const displayed = displayedThoughtHtml(
    chapterRangeHtml(content),
    content.format,
  );
  if (content.format === "txt") return displayed;
  return replaceFootnotes(displayed);
}

function resolveChapterThoughtRange(
  content: ChapterContent,
  offsets: { start: number; end: number; text: string },
): string | null {
  return resolveDisplayedThoughtRange(
    chapterRangeHtml(content),
    chapterDisplayHtml(content),
    offsets,
  );
}

function posUnderAnchor(scroller: HTMLElement, anchor: HTMLElement) {
  const scrollerRect = scroller.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  return overlayPosInScroller(
    {
      top: scrollerRect.top,
      left: scrollerRect.left,
      bottom: scrollerRect.bottom,
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
    },
    {
      top: anchorRect.top,
      left: anchorRect.left,
      bottom: anchorRect.bottom,
    },
  );
}

const App: React.FC = () => {
  const [groupOpen, setGroupOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const readerContentRef = useRef<HTMLDivElement>(null);
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [catalog, setCatalog] = useState<CatalogChapter[]>([]);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [chapterContent, setChapterContent] = useState<ChapterContent | null>(
    null,
  );
  const [view, setView] = useState<"shelf" | "reader">("shelf");
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [underlines, setUnderlines] = useState<Underline[]>([]);
  const [bestThoughts, setBestThoughts] = useState<Thought[]>([]);
  const [bestThoughtsVisible, setBestThoughtsVisible] = useState(false);
  const [bestThoughtsLoading, setBestThoughtsLoading] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [thoughtSubmitting, setThoughtSubmitting] = useState(false);
  const [currentRange, setCurrentRange] = useState("");
  const [composerEpoch, setComposerEpoch] = useState(0);
  const [underlineComposerOpen, setUnderlineComposerOpen] = useState(false);
  const [underlineAbstract, setUnderlineAbstract] = useState("");
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [selectionPos, setSelectionPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [selectionComposerOpen, setSelectionComposerOpen] = useState(false);
  const [selectionRange, setSelectionRange] = useState("");
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const [footnoteVisible, setFootnoteVisible] = useState(false);
  const [footnoteText, setFootnoteText] = useState("");
  const [footnotePos, setFootnotePos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const {
    readerFontSize,
    increase,
    decrease,
    increaseReader,
    decreaseReader,
  } = useFontSizeStore();

  const sortedBooks = useMemo(() => {
    return [...books].sort((a, b) => {
      const timeA = a.readUpdateTime || 0;
      const timeB = b.readUpdateTime || 0;
      return timeB - timeA;
    });
  }, [books]);

  const catalogRef = useRef<CatalogChapter[]>([]);
  const currentBookRef = useRef<Book | null>(null);
  const currentChapterUidRef = useRef<number | null>(null);
  const pendingUidRef = useRef<number | null>(null);
  const hasReceivedProgressRef = useRef<boolean>(false);
  const viewRef = useRef<"shelf" | "reader">(view);
  const likeRollbackRef = useRef<{
    reviewId: string;
    previous: { likeCount: number; liked: boolean };
  } | null>(null);
  const thoughtSubmittingRef = useRef(false);
  const thoughtRequestIdRef = useRef(0);
  const likeInFlightRef = useRef(false);
  const currentRangeRef = useRef("");
  const underlinesRef = useRef<Underline[]>([]);
  const bestThoughtsVisibleRef = useRef(false);
  const selectionOffsetsRef = useRef<{
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const pendingAddRef = useRef<{
    content: string;
    abstract: string;
    range: string;
    chapterUid: number;
    source: "underline" | "selection";
    requestId: number;
  } | null>(null);
  const pendingTocScrollRef = useRef<{
    title: string;
    anchor?: string;
  } | null>(null);

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  useEffect(() => {
    currentBookRef.current = currentBook;
  }, [currentBook]);

  useEffect(() => {
    currentChapterUidRef.current =
      catalog[currentChapterIdx]?.chapterUid ?? null;
  }, [catalog, currentChapterIdx]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    currentRangeRef.current = currentRange;
  }, [currentRange]);

  useEffect(() => {
    bestThoughtsVisibleRef.current = bestThoughtsVisible;
  }, [bestThoughtsVisible]);

  useEffect(() => {
    underlinesRef.current = underlines;
  }, [underlines]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { command, payload } = event.data;
      switch (command) {
        case "WEREAD_SHELF_DATA":
          setBooks(payload.books || []);
          setLoading(false);
          break;
        case "WEREAD_UNDERLINES_DATA": {
          const incomingUid = payload.chapterUid;
          const currentUid = currentChapterUidRef.current;
          // 忽略过期/错章的划线响应，避免旧 range 污染当前正文
          if (
            incomingUid != null &&
            currentUid != null &&
            String(incomingUid) !== String(currentUid)
          ) {
            console.log(
              "[Weread] Ignore stale underlines:",
              incomingUid,
              "current:",
              currentUid,
            );
            break;
          }
          console.log(
            "[Weread] Underlines received:",
            payload.underlines?.length,
            payload.underlines,
          );
          setUnderlines(payload.underlines || []);
          break;
        }
        case "WEREAD_BEST_THOUGHTS_DATA": {
          const incomingRange =
            payload && typeof payload === "object"
              ? (payload as { range?: unknown }).range
              : undefined;
          if (
            typeof incomingRange === "string" &&
            incomingRange !== currentRangeRef.current
          ) {
            break;
          }
          const formatted = Array.isArray(payload?.thoughts)
            ? payload.thoughts
            : parseHotThoughts(payload);
          setBestThoughts(formatted);
          setBestThoughtsLoading(false);
          setBestThoughtsVisible(true);
          break;
        }
        case "WEREAD_CATALOG_DATA": {
          const chapters = parseCatalogChapters(payload);
          if (chapters.length) {
            console.log(
              "[Weread] Catalog received:",
              chapters.length,
              "chapters",
            );
            setCatalog(chapters);
            const bookId = (payload as { data?: Array<{ bookId?: string }> })
              ?.data?.[0]?.bookId;
            if (!bookId) {
              break;
            }

            const pUid = pendingUidRef.current;
            const idx =
              pUid !== null
                ? chapters.findIndex(
                    c => String(c.chapterUid) === String(pUid),
                  )
                : -1;

            if (pUid !== null && idx !== -1) {
              console.log(
                "[Weread] Catalog arrived, matching pending progress:",
                pUid,
                "found idx:",
                idx,
              );
              loadChapterWithBookId(bookId, idx, chapters);
              pendingUidRef.current = null;
            } else if (!hasReceivedProgressRef.current) {
              console.log(
                "[Weread] Catalog arrived but progress pending, waiting for progress data...",
              );
            } else {
              console.log(
                "[Weread] Loading first chapter (no progress match or really no progress)",
              );
              loadChapterWithBookId(bookId, 0, chapters);
            }
          }
          break;
        }
        case "WEREAD_PROGRESS_DATA": {
          console.log("[Weread] Progress data received:", payload);
          hasReceivedProgressRef.current = true;
          const chapterUid = payload?.book?.chapterUid;
          const currentCatalog = catalogRef.current;

          if (currentCatalog.length > 0) {
            const idx = currentCatalog.findIndex(
              (c) => String(c.chapterUid) === String(chapterUid),
            );
            if (idx !== -1) {
              loadChapterWithBookId(
                payload.bookId || payload.book?.bookId,
                idx,
                currentCatalog,
              );
            }
          } else {
            pendingUidRef.current = chapterUid;
          }
          break;
        }
        case "WEREAD_CHAPTER_DATA": {
          const incomingBookId = payload?.bookId;
          const incomingUid = payload?.chapterUid;
          const currentBookId = currentBookRef.current?.bookId;
          const currentUid = currentChapterUidRef.current;
          if (viewRef.current !== "reader") {
            console.log("[Weread] Ignore chapter data after leaving reader");
            break;
          }
          if (incomingBookId && currentBookId && incomingBookId !== currentBookId) {
            console.log(
              "[Weread] Ignore stale chapter book:",
              incomingBookId,
              "current:",
              currentBookId,
            );
            break;
          }
          if (
            incomingUid != null &&
            currentUid != null &&
            String(incomingUid) !== String(currentUid)
          ) {
            console.log(
              "[Weread] Ignore stale chapter uid:",
              incomingUid,
              "current:",
              currentUid,
            );
            break;
          }
          console.log(
            "[Weread] Chapter content received:",
            payload.format,
            payload,
          );
          setChapterContent(payload);
          setLoading(false);
          setView("reader");
          const contentEl = document.querySelector(".reader-content");
          if (contentEl) contentEl.scrollTop = 0;
          break;
        }
        case "WEREAD_LIKE_THOUGHT_RESULT":
          likeInFlightRef.current = false;
          setLikingId(null);
          likeRollbackRef.current = null;
          break;
        case "WEREAD_ADD_THOUGHT_RESULT": {
          const pending = pendingAddRef.current;
          if (!isMatchingThoughtRequest(pending?.requestId, payload)) {
            break;
          }
          pendingAddRef.current = null;
          thoughtSubmittingRef.current = false;
          setThoughtSubmitting(false);
          setUnderlineComposerOpen(false);
          if (!pending) {
            break;
          }
          if (sameChapterUid(pending.chapterUid, currentChapterUidRef.current)) {
            setUnderlines(list => mergeUnderlineRanges(list, [pending.range]));
          }
          if (pending.source === "selection") {
            message.success("想法已发布");
            setSelectionPos(null);
            setSelectionComposerOpen(false);
            setSelectionRange("");
            selectionOffsetsRef.current = null;
            window.getSelection()?.removeAllRanges();
            // 热门列表未打开时不插入、不强开
            if (
              bestThoughtsVisibleRef.current &&
              pending.range === currentRangeRef.current
            ) {
              setBestThoughts(list => [
                thoughtFromAddResult(payload, pending),
                ...list,
              ]);
              setComposerEpoch(n => n + 1);
            }
            break;
          }
          // 换划线后回包对不上当前 range，丢弃以免插到错误列表
          if (pending.range !== currentRangeRef.current) {
            break;
          }
          const added = thoughtFromAddResult(payload, pending);
          setBestThoughts(list => [
            added,
            ...list.filter(item => item.reviewId !== added.reviewId),
          ]);
          setComposerEpoch(n => n + 1);
          const book = currentBookRef.current;
          const chapterUid = currentChapterUidRef.current;
          if (book && chapterUid != null) {
            vscode.postMessage({
              command: "WEREAD_GET_BEST_THOUGHTS",
              payload: {
                bookId: book.bookId,
                chapterUid,
                range: pending.range,
                ranges: reviewRangesForClickedUnderline(
                  pending.range,
                  underlinesRef.current,
                ),
              },
            });
          }
          break;
        }
        case "WEREAD_ERROR": {
          const sourceCommand =
            payload && typeof payload === "object"
              ? (payload as { command?: unknown }).command
              : undefined;
          // 只回滚本次点赞失败，避免书架/章节等错误误还原已成功的赞
          if (sourceCommand === "WEREAD_LIKE_THOUGHT") {
            likeInFlightRef.current = false;
            const rollback = likeRollbackRef.current;
            if (rollback) {
              setBestThoughts(list =>
                list.map(t =>
                  t.reviewId === rollback.reviewId
                    ? {
                        ...t,
                        likeCount: rollback.previous.likeCount,
                        liked: rollback.previous.liked,
                      }
                    : t,
                ),
              );
              likeRollbackRef.current = null;
              setLikingId(null);
            }
          }
          if (sourceCommand === "WEREAD_ADD_THOUGHT") {
            const pending = pendingAddRef.current;
            const incomingId = parseThoughtRequestId(payload);
            if (
              pending &&
              (incomingId == null ||
                isMatchingThoughtRequest(pending.requestId, payload))
            ) {
              pendingAddRef.current = null;
              thoughtSubmittingRef.current = false;
              setThoughtSubmitting(false);
            }
          } else if (!sourceCommand && thoughtSubmittingRef.current) {
            thoughtSubmittingRef.current = false;
            setThoughtSubmitting(false);
          }
          // 热门列表失败也要露出空态和作曲器，不能一直转圈
          setBestThoughtsLoading(false);
          message.error(payload.message);
          setLoading(false);
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    setLoading(true);
    vscode.postMessage({ command: "WEREAD_GET_SHELF" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const openBook = (book: Book) => {
    setCurrentBook(book);
    setView("reader");
    setLoading(true);
    setCatalog([]);
    setCurrentChapterIdx(0);
    pendingUidRef.current = null;
    hasReceivedProgressRef.current = false;

    vscode.postMessage({
      command: "WEREAD_GET_PROGRESS",
      payload: { bookId: book.bookId },
    });

    vscode.postMessage({
      command: "WEREAD_GET_CATALOG",
      payload: { bookId: book.bookId },
    });
  };

  const loadChapter = (idx: number) => {
    if (!currentBook || !catalog[idx]) return;
    loadChapterWithBookId(currentBook.bookId, idx, catalog);
  };

  const loadChapterWithBookId = (
    bookId: string,
    idx: number,
    chapters: CatalogChapter[],
  ) => {
    setLoading(true);
    setCurrentChapterIdx(idx);
    // 切章时先清空，避免旧章 range 落到新章 HTML 上把正文切坏
    setUnderlines([]);
    setBestThoughts([]);
    setBestThoughtsVisible(false);
    setUnderlineComposerOpen(false);
    setSelectionPos(null);
    setSelectionComposerOpen(false);
    setSelectionRange("");
    selectionOffsetsRef.current = null;
    const chapter = chapters[idx];
    currentChapterUidRef.current = chapter.chapterUid;

    vscode.postMessage({
      command: "WEREAD_GET_CHAPTER",
      payload: { bookId, chapterUid: chapter.chapterUid },
    });

    vscode.postMessage({
      command: "WEREAD_GET_UNDERLINES",
      payload: { bookId, chapterUid: chapter.chapterUid },
    });

    setCatalogVisible(false);
  };

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // 优先：检查注释图标点击，防止被外层划线拦截
    const footnoteEl = target.closest(".weread-footnote-wrapper") as HTMLElement;
    if (footnoteEl) {
      const note = footnoteEl.getAttribute("data-note");
      if (note) {
        const rect = footnoteEl.getBoundingClientRect();
        setFootnotePos({
          top: rect.top + rect.height,
          left: rect.left,
        });
        setFootnoteText(note);
        setFootnoteVisible(true);
      }
      return;
    }

    // 其次：检查划线点击
    const underlineEl = target.closest(".hot-underline") as HTMLElement;
    if (underlineEl) {
      setSelectionPos(null);
      setSelectionComposerOpen(false);
      setSelectionRange("");
      selectionOffsetsRef.current = null;
      const scroller = readerContentRef.current;
      if (scroller) {
        setPopoverPos(posUnderAnchor(scroller, underlineEl));
      }
      setBestThoughtsLoading(true);
      setBestThoughtsVisible(true);
      setUnderlineComposerOpen(false);
      setBestThoughts([]);
      setLikingId(null);
      likeRollbackRef.current = null;

      const range = underlineEl.getAttribute("data-range") || "";
      setCurrentRange(range);
      currentRangeRef.current = range;
      setUnderlineAbstract(underlineEl.textContent || "");
      if (range && currentBook && currentChapterIdx !== -1) {
        vscode.postMessage({
          command: "WEREAD_GET_BEST_THOUGHTS",
          payload: {
            bookId: currentBook.bookId,
            chapterUid: catalog[currentChapterIdx].chapterUid,
            range,
            ranges: reviewRangesForClickedUnderline(range, underlines),
          },
        });
      }
      return;
    }
  };

  const handleLikeThought = (thought: Thought) => {
    if (likeInFlightRef.current || likingId) return;
    likeInFlightRef.current = true;
    const previous = {
      likeCount: thought.likeCount ?? 0,
      liked: thought.liked,
    };
    likeRollbackRef.current = { reviewId: thought.reviewId, previous };
    const next = applyLikeToggle(previous.likeCount, previous.liked, !thought.liked);
    setBestThoughts(list =>
      list.map(item =>
        item.reviewId === thought.reviewId ? { ...item, ...next } : item,
      ),
    );
    setLikingId(thought.reviewId);
    vscode.postMessage({
      command: "WEREAD_LIKE_THOUGHT",
      payload: { reviewId: thought.reviewId, isLike: !thought.liked },
    });
  };

  const handleSubmitThought = (
    content: string,
    visibility: ThoughtVisibility,
  ) => {
    if (!currentBook || !catalog[currentChapterIdx] || !currentRange) return;
    if (thoughtSubmittingRef.current) return;
    const abstract = bestThoughts[0]?.abstract || underlineAbstract;
    const requestId = thoughtRequestIdRef.current + 1;
    thoughtRequestIdRef.current = requestId;
    pendingAddRef.current = {
      content,
      abstract,
      range: currentRange,
      chapterUid: catalog[currentChapterIdx].chapterUid,
      source: "underline",
      requestId,
    };
    thoughtSubmittingRef.current = true;
    setThoughtSubmitting(true);
    vscode.postMessage({
      command: "WEREAD_ADD_THOUGHT",
      payload: {
        bookId: currentBook.bookId,
        chapterUid: catalog[currentChapterIdx].chapterUid,
        chapterIdx: parseChapterIdx(catalog[currentChapterIdx].chapterIdx),
        range: currentRange,
        abstract,
        content,
        visibility,
        requestId,
      },
    });
  };

  const handleOpenSelectionComposer = () => {
    if (!chapterContent) {
      message.warning("无法定位这段原文，请换选一段");
      return;
    }
    const offsets = selectionOffsetsRef.current;
    if (!offsets) {
      message.warning("无法定位这段原文，请换选一段");
      return;
    }
    const range = resolveChapterThoughtRange(chapterContent, offsets);
    if (!range) {
      message.warning("无法定位这段原文，请换选一段");
      return;
    }
    setSelectionRange(range);
    setSelectionEpoch(n => n + 1);
    setSelectionComposerOpen(true);
  };

  const handleSubmitSelectionThought = (
    content: string,
    visibility: ThoughtVisibility,
  ) => {
    if (!currentBook || !catalog[currentChapterIdx] || !chapterContent) return;
    if (thoughtSubmittingRef.current) return;
    const offsets = selectionOffsetsRef.current;
    if (!offsets) {
      message.warning("无法定位这段原文，请换选一段");
      return;
    }
    const range = resolveChapterThoughtRange(chapterContent, offsets);
    if (!range) {
      message.warning("无法定位这段原文，请换选一段");
      return;
    }
    const abstract = offsets.text.trim();
    const requestId = thoughtRequestIdRef.current + 1;
    thoughtRequestIdRef.current = requestId;
    pendingAddRef.current = {
      content,
      abstract,
      range,
      chapterUid: catalog[currentChapterIdx].chapterUid,
      source: "selection",
      requestId,
    };
    thoughtSubmittingRef.current = true;
    setThoughtSubmitting(true);
    vscode.postMessage({
      command: "WEREAD_ADD_THOUGHT",
      payload: {
        bookId: currentBook.bookId,
        chapterUid: catalog[currentChapterIdx].chapterUid,
        chapterIdx: parseChapterIdx(catalog[currentChapterIdx].chapterIdx),
        range,
        abstract,
        content,
        visibility,
        requestId,
      },
    });
  };

  const handleContentMouseUp = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".hot-underline")) {
      return;
    }
    const selection = window.getSelection();
    const root = document.querySelector(".xhtml-content") as HTMLElement | null;
    const offsets =
      selection && root ? textOffsetsInRoot(root, selection) : null;
    if (!offsets || !selection) {
      if (!selectionComposerOpen) {
        setSelectionPos(null);
        setSelectionRange("");
        selectionOffsetsRef.current = null;
      }
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    selectionOffsetsRef.current = offsets;
    setSelectionPos({ top: rect.bottom + 4, left: rect.left });
    setSelectionComposerOpen(false);
    setSelectionRange("");
  };

  const handleContentMouseOver = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const footnoteEl = target.closest(".weread-footnote-wrapper") as HTMLElement;
    if (footnoteEl) {
      const parentUnderline = footnoteEl.closest(".hot-underline") as HTMLElement;
      if (parentUnderline) {
        parentUnderline.classList.add("weread-underline-active-footnote");
      }
    }
  };

  const handleContentMouseOut = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const footnoteEl = target.closest(".weread-footnote-wrapper") as HTMLElement;
    if (footnoteEl) {
      const parentUnderline = footnoteEl.closest(".hot-underline") as HTMLElement;
      if (parentUnderline) {
        parentUnderline.classList.remove("weread-underline-active-footnote");
      }
    }
  };

  const backToShelf = () => {
    setView("shelf");
    setChapterContent(null);
    setUnderlines([]);
    setBestThoughts([]);
    setBestThoughtsVisible(false);
    setUnderlineComposerOpen(false);
    setSelectionPos(null);
    setSelectionComposerOpen(false);
    setSelectionRange("");
    selectionOffsetsRef.current = null;
    currentChapterUidRef.current = null;
    pendingTocScrollRef.current = null;
  };

  const handleRefresh = () => {
    if (view === "shelf") {
      setLoading(true);
      vscode.postMessage({ command: "WEREAD_GET_SHELF" });
    } else if (currentBook && catalog[currentChapterIdx]) {
      loadChapter(currentChapterIdx);
    }
  };

  const applyPendingTocScroll = () => {
    const target = pendingTocScrollRef.current;
    const scroller = readerContentRef.current;
    if (!target || !scroller) return;
    const root = scroller.querySelector(".xhtml-content");
    if (!(root instanceof HTMLElement)) return;
    let el: Element | null = null;
    if (target.anchor) {
      el =
        document.getElementById(target.anchor) ||
        root.querySelector(`[name="${target.anchor}"]`);
    }
    if (!el) {
      const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
      for (const node of headings) {
        if (node.textContent?.trim() === target.title) {
          el = node;
          break;
        }
      }
    }
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "start" });
      pendingTocScrollRef.current = null;
    }
  };

  const openTocRow = (row: CatalogTocRow) => {
    setCatalogVisible(false);
    pendingTocScrollRef.current =
      row.kind === "anchor"
        ? { title: row.title, anchor: row.anchor }
        : null;
    if (row.chapterIndex === currentChapterIdx) {
      requestAnimationFrame(() => applyPendingTocScroll());
      return;
    }
    loadChapter(row.chapterIndex);
  };

  const cleanedHtml = useMemo(() => {
    if (!chapterContent?.html) return "";
    const html = decodeChapterHtml(chapterContent.html);

    if (chapterContent.format === "txt") {
      const source = prepareThoughtRangeHtml(html, "txt");
      return displayedThoughtHtml(
        injectUnderlines(source, underlines),
        "txt",
      );
    }

    // 先处理无划线版本，作为注入失败时的回退基准
    const baseHtml = replaceFootnotes(stripChapterWrappers(html));
    if (!underlines.length) return baseHtml;

    const injectedHtml = replaceFootnotes(
      stripChapterWrappers(injectUnderlines(html, underlines)),
    );

    // 注入若仍破坏结构，DOMParser 会丢掉后续节点；纯文本变短则回退
    const baseTextLen = baseHtml.replace(/<[^>]+>/g, "").length;
    const injectedTextLen = injectedHtml.replace(/<[^>]+>/g, "").length;
    if (baseTextLen > 0 && injectedTextLen < baseTextLen) {
      console.warn(
        "[Weread] 划线注入导致正文丢失，已回退为无划线内容",
        { baseTextLen, injectedTextLen },
      );
      return baseHtml;
    }

    return injectedHtml;
  }, [chapterContent, underlines]);

  useEffect(() => {
    if (!bestThoughtsVisible || !currentRange) return;
    const scroller = readerContentRef.current;
    if (!scroller) return;
    const el = scroller.querySelector(
      `.hot-underline[data-range="${currentRange}"]`,
    );
    if (el instanceof HTMLElement) {
      setPopoverPos(posUnderAnchor(scroller, el));
    }
  }, [bestThoughtsVisible, currentRange, cleanedHtml]);

  useEffect(() => {
    if (loading || !chapterContent) return;
    applyPendingTocScroll();
  }, [loading, chapterContent, cleanedHtml]);

  useReadSession({
    enabled: view === "reader" && !loading && !!chapterContent,
    bookId: currentBook?.bookId,
    chapterUid: catalog[currentChapterIdx]?.chapterUid,
    chapterIdx: parseChapterIdx(catalog[currentChapterIdx]?.chapterIdx),
    format: chapterContent?.format,
  });

  return (
    <div className={`weread-app ${view}`}>
      {view === "shelf" ? (
        <>
          <div className="header">
            <h1>书架</h1>
          </div>
          <div className="shelf-content">
            {loading ? (
              <div className="loading-container">
                <Spin size="large" />
              </div>
            ) : books.length > 0 ? (
              <div className="shelf-grid">
                {sortedBooks.map((book: Book) => (
                  <div
                    key={book.bookId}
                    className="book-item"
                    onClick={() => openBook(book)}
                  >
                    <div className="book-cover">
                      <img src={book.cover} alt={book.title} />
                    </div>
                    <div className="book-info">
                      <span className="book-title">{book.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="书架空空如也" />
            )}
          </div>
        </>
      ) : (
        <div className="reader-view">
          <div className="reader-header">
            <Button type="text" icon={<LeftOutlined />} onClick={backToShelf} />
            <span className="reader-title">{currentBook?.title}</span>
          </div>
          <div
            ref={readerContentRef}
            className="reader-content"
            onClick={handleContentClick}
            onMouseUp={handleContentMouseUp}
            onMouseOver={handleContentMouseOver}
            onMouseOut={handleContentMouseOut}
          >
            {loading ? (
              <div className="loading-container">
                <Spin />
              </div>
            ) : (
              chapterContent && (
                <div
                  className="content-body"
                  style={
                    {
                      "--reader-font-size": `${readerFontSize}px`,
                    } as React.CSSProperties
                  }
                >
                  <style>{chapterContent.style || ""}</style>
                  <div className="chapter-header">
                    {catalog[currentChapterIdx]?.title}
                  </div>
                  <div
                    className="xhtml-content"
                    dangerouslySetInnerHTML={{ __html: cleanedHtml }}
                  />
                  <div className="reader-footer">
                    <Button
                      disabled={currentChapterIdx <= 0}
                      icon={<DoubleLeftOutlined />}
                      onClick={() => loadChapter(currentChapterIdx - 1)}
                    >
                      上一章
                    </Button>
                    <Button
                      disabled={currentChapterIdx >= catalog.length - 1}
                      icon={<DoubleRightOutlined />}
                      onClick={() => loadChapter(currentChapterIdx + 1)}
                    >
                      下一章
                    </Button>
                  </div>
                </div>
              )
            )}
            <Popover
              open={bestThoughtsVisible}
              overlayClassName="thought-popover"
              onOpenChange={visible => {
                if (!visible) {
                  setBestThoughtsVisible(false);
                  setUnderlineComposerOpen(false);
                  setPopoverPos(null);
                }
              }}
              trigger="click"
              placement="bottomLeft"
              autoAdjustOverflow={false}
              getPopupContainer={trigger =>
                trigger.parentElement ?? document.body
              }
              content={
                <div
                  className="thought-panel"
                  onClick={e => e.stopPropagation()}
                >
                    {bestThoughtsLoading ? (
                      <div style={{ padding: "20px", textAlign: "center" }}>
                        <Spin size="small" />
                      </div>
                    ) : (
                      <>
                        <p className="thought-panel-meta">
                          想法 · {bestThoughts.length}
                        </p>
                        <div className="thought-list">
                          {bestThoughts.length > 0 ? (
                            bestThoughts.map(thought => (
                              <article
                                key={thought.reviewId}
                                className="thought-card"
                              >
                                <div className="thought-head">
                                  <img
                                    className="thought-avatar"
                                    src={thought.user.avatar}
                                    alt=""
                                  />
                                  <span className="thought-name">
                                    {thought.user.name}
                                  </span>
                                </div>
                                <div className="thought-body">
                                  {thought.content}
                                </div>
                                <div className="thought-like-row">
                                  <button
                                    type="button"
                                    className={`thought-like${thought.liked ? " is-liked" : ""}`}
                                    aria-pressed={thought.liked}
                                    disabled={likingId === thought.reviewId}
                                    onClick={() => handleLikeThought(thought)}
                                  >
                                    {thought.liked ? (
                                      <LikeFilled />
                                    ) : (
                                      <LikeOutlined />
                                    )}{" "}
                                    {thought.likeCount}
                                  </button>
                                </div>
                              </article>
                            ))
                          ) : (
                            <p className="thought-empty">暂无想法</p>
                          )}
                        </div>
                        <div className="thought-compose-slot">
                          {underlineComposerOpen ? (
                            <ThoughtComposer
                              key={`${currentRange}-${composerEpoch}`}
                              submitting={thoughtSubmitting}
                              onSubmit={handleSubmitThought}
                            />
                          ) : (
                            <Button
                              size="small"
                              onClick={() => setUnderlineComposerOpen(true)}
                            >
                              写想法
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                </div>
              }
            >
              <div
                style={{
                  position: "absolute",
                  top: popoverPos ? popoverPos.top : -999,
                  left: popoverPos ? popoverPos.left : -999,
                  width: "1px",
                  height: "1px",
                  pointerEvents: "none",
                }}
              />
            </Popover>
          </div>
        </div>
      )}

      <Drawer
        title="目录"
        placement="left"
        onClose={() => setCatalogVisible(false)}
        open={catalogVisible}
        width={300}
        styles={{ body: { padding: 0 } }}
      >
        <div className="catalog-list">
          {flattenCatalogToc(catalog).map((row, rowIndex) => (
            <div
              key={`${row.kind}-${row.chapterUid}-${rowIndex}-${row.title}`}
              id={
                row.kind === "chapter"
                  ? `chapter-${row.chapterIndex}`
                  : undefined
              }
              className={`catalog-item ${currentChapterIdx === row.chapterIndex && row.kind === "chapter" ? "active" : ""} level-${row.level}`}
              onClick={() => openTocRow(row)}
            >
              {row.title}
            </div>
          ))}
        </div>
      </Drawer>

      <Popover
        open={footnoteVisible}
        onOpenChange={(visible) => {
          if (!visible) {
            setFootnoteVisible(false);
            setFootnotePos(null);
          }
        }}
        trigger="click"
        placement="bottomLeft"
        content={
          <div
            style={{
              maxWidth: "320px",
              padding: "10px 14px",
              fontSize: "calc(var(--app-font-size) - 1px)",
              color: "var(--vscode-editor-foreground)",
              lineHeight: "1.6",
              borderRadius: "8px",
            }}
          >
            {footnoteText}
          </div>
        }
      >
        <div
          style={{
            position: "fixed",
            top: footnotePos ? footnotePos.top : -999,
            left: footnotePos ? footnotePos.left : -999,
            width: "1px",
            height: "1px",
            pointerEvents: "none",
            zIndex: 9999,
          }}
        />
      </Popover>

      {selectionPos && (
        <Popover
          open={selectionComposerOpen}
          overlayClassName="thought-popover"
          onOpenChange={visible => {
            if (!visible) {
              setSelectionComposerOpen(false);
            }
          }}
          trigger="click"
          placement="bottomLeft"
          content={
            selectionRange ? (
              <div className="thought-panel">
                <ThoughtComposer
                  key={`${selectionRange}-${selectionEpoch}`}
                  submitting={thoughtSubmitting}
                  onSubmit={handleSubmitSelectionThought}
                />
              </div>
            ) : null
          }
        >
          <Button
            size="small"
            style={{
              position: "fixed",
              top: selectionPos.top,
              left: selectionPos.left,
              zIndex: 10000,
            }}
            onMouseDown={e => e.preventDefault()}
            onClick={handleOpenSelectionComposer}
          >
            写想法
          </Button>
        </Popover>
      )}

      <Drawer
        title="热门想法"
        placement="right"
        onClose={() => setBestThoughtsVisible(false)}
        open={false} // 改用 Popover 后这里不再显示
        width={350}
        styles={{ body: { padding: "16px" } }}
      >
        <div className="best-thoughts-list">
          {bestThoughts.length > 0 ? (
            bestThoughts.map((thought) => (
              <div
                key={thought.reviewId}
                className="thought-item"
                style={{
                  marginBottom: "24px",
                  borderBottom: "1px solid var(--vscode-chat-requestBorder)",
                  paddingBottom: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "12px",
                  }}
                >
                  <img
                    src={thought.user.avatar}
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "calc(var(--app-font-size) - 1px)",
                    }}
                  >
                    {thought.user.name}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "var(--vscode-editor-foreground)",
                  }}
                >
                  {thought.content}
                </div>
              </div>
            ))
          ) : (
            <Empty description="暂无更多想法" />
          )}
        </div>
      </Drawer>

      {view === "reader" && (
        <FloatButton.BackTop
          className="sidethread-float-backtop"
          style={{ insetInlineEnd: 24, bottom: 24 }}
          target={() =>
            document.querySelector(".reader-content") as HTMLElement
          }
          visibilityHeight={400}
          icon={<VerticalAlignTopOutlined />}
          tooltip={<div>回到顶部</div>}
        />
      )}
      <div ref={groupRef}>
        <FloatButton
          className="sidethread-float-refresh"
          style={{ insetInlineEnd: 24, bottom: 88 }}
          icon={<ReloadOutlined style={{ color: "#1890ff" }} />}
          tooltip={<div>{view === "shelf" ? "刷新书架" : "刷新本章"}</div>}
          onClick={handleRefresh}
        />
        <FloatButton.Group
          trigger="click"
          open={groupOpen}
          onOpenChange={(open) => {
            const event = window.event as MouseEvent;
            if (event && groupRef.current?.contains(event.target as Node)) {
              setGroupOpen(open);
            }
          }}
          shape="circle"
          style={{ insetInlineEnd: 24, bottom: 152 }}
          icon={<AppstoreOutlined />}
        >
          <FloatButton
            icon={<MinusOutlined style={{ color: "#52c41a" }} />}
            tooltip={<div>减小字体</div>}
            onClick={view === "reader" ? decreaseReader : decrease}
          />
          <FloatButton
            icon={<PlusOutlined style={{ color: "#ff4d4f" }} />}
            tooltip={<div>增大字体</div>}
            onClick={view === "reader" ? increaseReader : increase}
          />

          {view === "reader" && (
            <FloatButton
              icon={<UnorderedListOutlined style={{ color: "#faad14" }} />}
              tooltip={<div>查看目录</div>}
              onClick={() => {
                setCatalogVisible(true);
                setTimeout(() => {
                  const activeItem = document.getElementById(
                    `chapter-${currentChapterIdx}`,
                  );
                  if (activeItem) {
                    activeItem.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }
                }, 100);
              }}
            />
          )}
        </FloatButton.Group>
      </div>
    </div>
  );
};

export default App;
