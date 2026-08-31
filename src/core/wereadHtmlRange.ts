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

export function resolveDisplayedThoughtRange(
  html: string,
  offsets: { start: number; end: number; text: string },
): string | null {
  const range = htmlRangeFromDisplayedTextOffsets(
    html,
    offsets.start,
    offsets.end,
  );
  if (!range || !canUseThoughtRange(html, range)) return null;
  const [htmlStart, htmlEnd] = range.split("-").map(Number);
  if (
    htmlSlicePlainText(html, htmlStart, htmlEnd).trim() !== offsets.text.trim()
  ) {
    return null;
  }
  return range;
}
