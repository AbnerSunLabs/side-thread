export type UnderlineLike = {
  range: string;
  count: number;
  type: number;
};

export function isUnderlineRange(range: unknown): range is string {
  if (typeof range !== "string" || !range) return false;
  const parts = range.split("-");
  if (parts.length !== 2) return false;
  const start = Number(parts[0]);
  const end = Number(parts[1]);
  return Number.isInteger(start) && Number.isInteger(end) && end > start;
}

/** 官方 Range.isIntersect：两端都是半开区间 [start, end) */
export function rangesOverlap(left: unknown, right: unknown): boolean {
  if (!isUnderlineRange(left) || !isUnderlineRange(right)) return false;
  const [ls, le] = left.split("-").map(Number);
  const [rs, re] = right.split("-").map(Number);
  return ls < re && rs < le;
}

export function sameChapterUid(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return false;
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && a === b;
}

export function ownBookmarkRangesForChapter(
  bookmarkList: unknown,
  chapterUid: number | string,
): string[] {
  if (!bookmarkList || typeof bookmarkList !== "object") return [];
  const updated = (bookmarkList as { updated?: unknown }).updated;
  if (!Array.isArray(updated)) return [];
  const ranges: string[] = [];
  for (const item of updated) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      chapterUid?: unknown;
      range?: unknown;
      type?: unknown;
    };
    if (!sameChapterUid(row.chapterUid, chapterUid)) continue;
    // type=0 是书签，type=1 才是划线
    if (row.type != null && Number(row.type) !== 1) continue;
    if (!isUnderlineRange(row.range)) continue;
    ranges.push(row.range);
  }
  return ranges;
}

/**
 * 从「我的想法」列表里取本章的 range。
 * 官方划选写想法只调 /web/review/add，不会另建 bookmark，
 * 划线是想法自带的 range 渲染出来的。
 */
export function ownThoughtRangesForChapter(
  reviewList: unknown,
  chapterUid: number | string,
): string[] {
  if (!reviewList || typeof reviewList !== "object") return [];
  const source = reviewList as { updated?: unknown; reviews?: unknown };
  const rows = [
    ...(Array.isArray(source.updated) ? source.updated : []),
    ...(Array.isArray(source.reviews) ? source.reviews : []),
  ];
  const ranges: string[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    // /web/review/list 的 reviews 项是 { review: {...} }，updated 项则是扁平的
    const wrapped = (item as { review?: unknown }).review;
    const row = (wrapped && typeof wrapped === "object" ? wrapped : item) as {
      chapterUid?: unknown;
      range?: unknown;
    };
    if (!sameChapterUid(row.chapterUid, chapterUid)) continue;
    if (!isUnderlineRange(row.range)) continue;
    ranges.push(row.range);
  }
  return ranges;
}

export function mergeUnderlineRanges(
  hot: UnderlineLike[],
  ownRanges: string[],
): UnderlineLike[] {
  const seen = new Set(hot.map(item => item.range));
  const extra: UnderlineLike[] = [];
  for (const range of ownRanges) {
    if (!isUnderlineRange(range) || seen.has(range)) continue;
    seen.add(range);
    extra.push({ range, count: 1, type: 1 });
  }
  return extra.length ? [...hot, ...extra] : hot;
}

/** 点划线拉想法：自己的 range 可能和热门 range 不完全相同，要一起问 readReviews */
export function reviewRangesForClickedUnderline(
  clicked: string,
  underlines: UnderlineLike[],
): string[] {
  const seen = new Set<string>();
  const ranges: string[] = [];
  const add = (range: string) => {
    if (!isUnderlineRange(range) || seen.has(range)) return;
    seen.add(range);
    ranges.push(range);
  };
  add(clicked);
  for (const item of underlines) {
    if (rangesOverlap(item.range, clicked)) add(item.range);
  }
  return ranges;
}
