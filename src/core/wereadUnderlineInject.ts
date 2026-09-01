import { isUnderlineRange, rangesOverlap, type UnderlineLike } from "./wereadBookmarks";

/** 判断下标是否落在 HTML 标签内部（含属性） */
export function isInsideHtmlTag(html: string, index: number): boolean {
  const lastOpen = html.lastIndexOf("<", index);
  const lastClose = html.lastIndexOf(">", index);
  return lastOpen > lastClose;
}

/**
 * 把 [start, end) 切成若干「不含标签」的纯文本片段。
 * 选区跨标签（如 `abc<em>def</em>ghi`）时官方一样能划线，
 * 因此这里逐段包 span，而不是整体放弃。
 */
export function textSegmentsInRange(
  html: string,
  start: number,
  end: number,
): Array<[number, number]> {
  const from = Math.max(0, start);
  const to = Math.min(html.length, end);
  if (from >= to) return [];

  const segments: Array<[number, number]> = [];
  let inTag = isInsideHtmlTag(html, from);
  let segStart = inTag ? -1 : from;

  for (let i = from; i < to; i++) {
    const ch = html[i];
    if (inTag) {
      if (ch === ">") {
        inTag = false;
        segStart = i + 1;
      }
      continue;
    }
    if (ch === "<") {
      if (segStart >= 0 && i > segStart) segments.push([segStart, i]);
      inTag = true;
      segStart = -1;
    }
  }
  if (!inTag && segStart >= 0 && to > segStart) segments.push([segStart, to]);

  // 纯空白片段包上 span 只会制造游离的下划线，跳过
  return segments.filter(([a, b]) => html.slice(a, b).trim() !== "");
}

function rangeStart(range: string): number {
  return parseInt(range.split("-")[0], 10);
}

function rangeWidth(range: string): number {
  const [start, end] = range.split("-").map(Number);
  return end - start;
}

/**
 * 重叠区间只能留一条 span。优先保留更宽的（热门划线），
 * 否则点到自己的短 range 时 readReviews 拉不到别人的想法。
 */
export function pickNonOverlappingUnderlines(
  underlines: UnderlineLike[],
): UnderlineLike[] {
  const valid = underlines.filter(item => isUnderlineRange(item.range));
  const ranked = [...valid].sort((a, b) => {
    const widthDiff = rangeWidth(b.range) - rangeWidth(a.range);
    if (widthDiff !== 0) return widthDiff;
    const countDiff = (b.count || 0) - (a.count || 0);
    if (countDiff !== 0) return countDiff;
    return rangeStart(b.range) - rangeStart(a.range);
  });
  const picked: UnderlineLike[] = [];
  for (const item of ranked) {
    if (picked.some(seen => rangesOverlap(seen.range, item.range))) continue;
    picked.push(item);
  }
  return picked.sort((a, b) => rangeStart(b.range) - rangeStart(a.range));
}

/** 按官方 range 坐标（未 strip 的原始 HTML 下标）注入划线 span。 */
export function injectUnderlines(
  rawHtml: string,
  underlines: UnderlineLike[],
): string {
  if (!underlines.length) return rawHtml;

  const sorted = pickNonOverlappingUnderlines(underlines);

  let result = rawHtml;
  // 已接受区间的最小下标：从后往前插入，只要不重叠，先前插入就不会移动当前下标
  let acceptedFrom = rawHtml.length;
  sorted.forEach(underline => {
    const [start, end] = underline.range.split("-").map(Number);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    // 重叠区间会插出交叉嵌套的 span，直接跳过后来的那条
    if (end > acceptedFrom) return;

    // 切分必须按原始 HTML 算，否则会把先前插入的 span 当成标签边界
    const segments = textSegmentsInRange(rawHtml, start, end);
    if (!segments.length) return;
    acceptedFrom = start;
    // 从后往前插入，前面的片段下标才不会被撑开
    for (let i = segments.length - 1; i >= 0; i--) {
      const [segStart, segEnd] = segments[i];
      const before = result.slice(0, segStart);
      const middle = result.slice(segStart, segEnd);
      const after = result.slice(segEnd);
      result = `${before}<span class="hot-underline" data-range="${underline.range}">${middle}</span>${after}`;
    }
  });

  return result;
}
