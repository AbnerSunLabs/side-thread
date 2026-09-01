export type CatalogAnchor = {
  title: string;
  level: number;
  anchor?: string;
};

export type CatalogChapter = {
  chapterUid: number;
  chapterIdx?: number | string;
  title: string;
  level: number;
  anchors: CatalogAnchor[];
};

export type CatalogTocRow = {
  kind: "chapter" | "anchor";
  chapterIndex: number;
  chapterUid: number;
  title: string;
  level: number;
  anchor?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseAnchor(value: unknown): CatalogAnchor | null {
  const row = asRecord(value);
  if (!row) return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  const level = Number(row.level);
  const anchor = typeof row.anchor === "string" ? row.anchor : undefined;
  return {
    title,
    level: Number.isInteger(level) && level > 0 ? level : 2,
    ...(anchor ? { anchor } : {}),
  };
}

function parseChapter(value: unknown): CatalogChapter | null {
  const row = asRecord(value);
  if (!row) return null;
  const chapterUid = Number(row.chapterUid);
  const title = typeof row.title === "string" ? row.title : "";
  if (!Number.isFinite(chapterUid) || !title) return null;
  const level = Number(row.level);
  const rawAnchors = Array.isArray(row.anchors) ? row.anchors : [];
  const chapterIdx =
    typeof row.chapterIdx === "number" || typeof row.chapterIdx === "string"
      ? row.chapterIdx
      : undefined;
  return {
    chapterUid,
    title,
    level: Number.isInteger(level) && level > 0 ? level : 1,
    anchors: rawAnchors
      .map(parseAnchor)
      .filter((item): item is CatalogAnchor => item != null),
    ...(chapterIdx !== undefined ? { chapterIdx } : {}),
  };
}

/** 官方 /web/book/chapterInfos：data[0].updated，否则 data[0].chapters */
export function parseCatalogChapters(payload: unknown): CatalogChapter[] {
  const root = asRecord(payload);
  const data = root && Array.isArray(root.data) ? root.data[0] : null;
  const book = asRecord(data);
  if (!book) return [];
  const rows = Array.isArray(book.updated)
    ? book.updated
    : Array.isArray(book.chapters)
      ? book.chapters
      : [];
  return rows
    .map(parseChapter)
    .filter((item): item is CatalogChapter => item != null);
}

/** App 目录：章下面展开官方 anchors（节），加载仍用章的 chapterUid */
export function flattenCatalogToc(chapters: CatalogChapter[]): CatalogTocRow[] {
  const rows: CatalogTocRow[] = [];
  chapters.forEach((chapter, chapterIndex) => {
    rows.push({
      kind: "chapter",
      chapterIndex,
      chapterUid: chapter.chapterUid,
      title: chapter.title,
      level: chapter.level,
    });
    for (const item of chapter.anchors) {
      if (!item.title.trim()) continue;
      rows.push({
        kind: "anchor",
        chapterIndex,
        chapterUid: chapter.chapterUid,
        title: item.title,
        level: item.level,
        ...(item.anchor ? { anchor: item.anchor } : {}),
      });
    }
  });
  return rows;
}
