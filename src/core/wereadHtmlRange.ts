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
): string | null {
  if (textStart < 0 || textEnd <= textStart) return null;
  let textIdx = 0;
  let htmlStart = -1;
  let htmlEnd = -1;
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
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
