import * as assert from "assert";
import { describe, it } from "mocha";
import {
  flattenCatalogToc,
  parseCatalogChapters,
} from "../core/wereadCatalog";

describe("weread catalog toc", () => {
  it("keeps loadable chapters separate from in-chapter sections", () => {
    const chapters = parseCatalogChapters({
      data: [
        {
          updated: [
            {
              chapterUid: 2,
              chapterIdx: 2,
              title: "Chapter 02",
              level: 1,
              anchors: [
                { title: "Section 1 不要批评", level: 2, anchor: "sec-1" },
                { title: "Section 2 真诚的赞赏", level: 2 },
              ],
            },
            { chapterUid: 3, title: "Chapter 03", level: 1 },
          ],
        },
      ],
    });
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].chapterUid, 2);
    const toc = flattenCatalogToc(chapters);
    assert.deepEqual(
      toc.map(row => ({
        kind: row.kind,
        title: row.title,
        level: row.level,
        chapterIndex: row.chapterIndex,
        anchor: row.anchor,
      })),
      [
        {
          kind: "chapter",
          title: "Chapter 02",
          level: 1,
          chapterIndex: 0,
          anchor: undefined,
        },
        {
          kind: "anchor",
          title: "Section 1 不要批评",
          level: 2,
          chapterIndex: 0,
          anchor: "sec-1",
        },
        {
          kind: "anchor",
          title: "Section 2 真诚的赞赏",
          level: 2,
          chapterIndex: 0,
          anchor: undefined,
        },
        {
          kind: "chapter",
          title: "Chapter 03",
          level: 1,
          chapterIndex: 1,
          anchor: undefined,
        },
      ],
    );
  });

  it("prefers updated then chapters, and skips untitled anchors", () => {
    const fromChapters = parseCatalogChapters({
      data: [{ chapters: [{ chapterUid: 1, title: "前言", level: 1 }] }],
    });
    assert.equal(fromChapters[0].title, "前言");
    const toc = flattenCatalogToc([
      {
        chapterUid: 1,
        title: "章",
        level: 1,
        anchors: [{ title: "", level: 2 }, { title: "有标题", level: 3 }],
      },
    ]);
    assert.equal(toc.length, 2);
    assert.equal(toc[1].title, "有标题");
    assert.equal(toc[1].level, 3);
  });
});
