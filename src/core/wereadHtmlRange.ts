function isInsideHtmlTag(html: string, index: number): boolean {
  const lastOpen = html.lastIndexOf("<", index);
  const lastClose = html.lastIndexOf(">", index);
  return lastOpen > lastClose;
}

function canInjectUnderlineRange(
  html: string,
  start: number,
  end: number,
): boolean {
  if (start < 0 || end > html.length || start >= end) return false;
  if (isInsideHtmlTag(html, start) || isInsideHtmlTag(html, end - 1)) {
    return false;
  }
  return !/[<>]/.test(html.slice(start, end));
}

export function canUseThoughtRange(html: string, range: string): boolean {
  const match = /^(\d+)-(\d+)$/.exec(range);
  if (!match) return false;
  return canInjectUnderlineRange(html, Number(match[1]), Number(match[2]));
}

export function htmlRangeFromTextOffsets(
  html: string,
  textStart: number,
  textEnd: number,
  fromIndex = 0,
): string | null {
  if (textStart < 0 || textEnd <= textStart) return null;
  let textIdx = 0;
  let htmlStart = -1;
  let htmlEnd = -1;
  let inTag = false;
  for (let i = fromIndex; i < html.length; i++) {
    const ch = html[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (inTag) {
      if (ch === ">") inTag = false;
      continue;
    }
    if (textIdx === textStart) htmlStart = i;
    textIdx += 1;
    if (textIdx === textEnd) {
      htmlEnd = i + 1;
      break;
    }
  }
  if (htmlStart < 0 || htmlEnd < 0) return null;
  if (!canInjectUnderlineRange(html, htmlStart, htmlEnd)) return null;
  return `${htmlStart}-${htmlEnd}`;
}

export function htmlSlicePlainText(
  html: string,
  start: number,
  end: number,
): string {
  return html.slice(start, end).replace(/<[^>]+>/g, "");
}

/** TXT 去掉空行后、注入 span 前的原文；其它格式原样（调用方先做与划线注入相同的实体解码）。 */
export function prepareThoughtRangeHtml(html: string, format: string): string {
  if (format === "txt") {
    return html
      .split(/\r?\n/)
      .filter(p => p.trim() !== "")
      .join("\n");
  }
  return html;
}

/** 与阅读器 `.xhtml-content` 相同的去壳（注入划线 span 之前）。 */
export function stripChapterWrappers(html: string): string {
  return html
    .replace(/<\?xml.*\?>/gi, "")
    .replace(/<!DOCTYPE.*?>/gi, "")
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<head[^>]*>[\s\S]*<\/head>/gi, "")
    .replace(/<body[^>]*>/gi, "")
    .replace(/<\/body>/gi, "");
}

/** TXT 展示层把换行段包成 `<p>`；EPUB 只 strip，不含划线 span。 */
export function displayedThoughtHtml(html: string, format: string): string {
  if (format === "txt") {
    return prepareThoughtRangeHtml(html, "txt")
      .split("\n")
      .map(p => `<p>${p}</p>`)
      .join("");
  }
  return stripChapterWrappers(html);
}

/** 正文文本计数起点：`<body>` 之后；无 body 则从头。 */
export function chapterBodyTextStart(html: string): number {
  const match = /<body\b[^>]*>/i.exec(html);
  return match ? match.index + match[0].length : 0;
}

/** DOM 正文偏移 → 未 strip 的原始 HTML `start-end`（与热门划线同一套坐标）。 */
export function htmlRangeFromDisplayedTextOffsets(
  html: string,
  textStart: number,
  textEnd: number,
): string | null {
  return htmlRangeFromTextOffsets(
    html,
    textStart,
    textEnd,
    chapterBodyTextStart(html),
  );
}

type HtmlTextChar = { htmlIndex: number; char: string };

function collectTextChars(html: string, fromIndex = 0): HtmlTextChar[] {
  const out: HtmlTextChar[] = [];
  let inTag = false;
  for (let i = fromIndex; i < html.length; i++) {
    const ch = html[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (inTag) {
      if (ch === ">") inTag = false;
      continue;
    }
    out.push({ htmlIndex: i, char: ch });
  }
  return out;
}

function isHtmlWhitespace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}

/** 把展示层文本下标对齐到原文文本下标，跳过一侧多出来的空白（TXT 换行、pretty-print 残留）。 */
function alignedOriginalTextIndex(
  originalChars: HtmlTextChar[],
  displayChars: HtmlTextChar[],
  targetDi: number,
): number | null {
  let oi = 0;
  let di = 0;
  while (di < targetDi) {
    if (
      oi < originalChars.length &&
      di < displayChars.length &&
      originalChars[oi].char === displayChars[di].char
    ) {
      oi += 1;
      di += 1;
      continue;
    }
    if (oi < originalChars.length && isHtmlWhitespace(originalChars[oi].char)) {
      oi += 1;
      continue;
    }
    if (di < displayChars.length && isHtmlWhitespace(displayChars[di].char)) {
      di += 1;
      continue;
    }
    return null;
  }
  return oi;
}

function mapDisplayOffsetsToOriginalRange(
  originalHtml: string,
  displayedHtml: string,
  textStart: number,
  textEnd: number,
): string | null {
  const displayChars = collectTextChars(displayedHtml);
  const originalChars = collectTextChars(
    originalHtml,
    chapterBodyTextStart(originalHtml),
  );
  const startOi = alignedOriginalTextIndex(
    originalChars,
    displayChars,
    textStart,
  );
  const endOi = alignedOriginalTextIndex(originalChars, displayChars, textEnd);
  if (startOi == null || endOi == null || endOi === 0) return null;
  let mappedStart = startOi;
  while (
    mappedStart < originalChars.length &&
    isHtmlWhitespace(originalChars[mappedStart].char) &&
    (textStart >= displayChars.length ||
      originalChars[mappedStart].char !== displayChars[textStart].char)
  ) {
    mappedStart += 1;
  }
  if (mappedStart >= originalChars.length || mappedStart >= endOi) return null;
  const htmlStart = originalChars[mappedStart].htmlIndex;
  const htmlEnd = originalChars[endOi - 1].htmlIndex + 1;
  if (!canInjectUnderlineRange(originalHtml, htmlStart, htmlEnd)) return null;
  return `${htmlStart}-${htmlEnd}`;
}

export function resolveDisplayedThoughtRange(
  originalHtml: string,
  displayedHtml: string,
  offsets: { start: number; end: number; text: string },
): string | null {
  const displayRange = htmlRangeFromTextOffsets(
    displayedHtml,
    offsets.start,
    offsets.end,
  );
  if (!displayRange) return null;
  const [displayStart, displayEnd] = displayRange.split("-").map(Number);
  if (
    htmlSlicePlainText(displayedHtml, displayStart, displayEnd).trim() !==
    offsets.text.trim()
  ) {
    return null;
  }
  const range = mapDisplayOffsetsToOriginalRange(
    originalHtml,
    displayedHtml,
    offsets.start,
    offsets.end,
  );
  if (!range || !canUseThoughtRange(originalHtml, range)) return null;
  const [htmlStart, htmlEnd] = range.split("-").map(Number);
  if (
    htmlSlicePlainText(originalHtml, htmlStart, htmlEnd).trim() !==
    offsets.text.trim()
  ) {
    return null;
  }
  return range;
}
