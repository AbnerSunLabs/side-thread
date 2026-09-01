import * as assert from "assert";
import { describe, it } from "mocha";
import {
  mergeUnderlineRanges,
  ownBookmarkRangesForChapter,
  ownThoughtRangesForChapter,
  rangesOverlap,
} from "../core/wereadBookmarks";

describe("weread bookmarks", () => {
  it("picks this chapter's underline ranges from bookmarklist", () => {
    const ranges = ownBookmarkRangesForChapter(
      {
        updated: [
          { chapterUid: 9, range: "3-8", type: 1 },
          { chapterUid: 9, range: "1-2", type: 0 },
          { chapterUid: 8, range: "10-20", type: 1 },
          { chapterUid: 9, range: "bad", type: 1 },
        ],
      },
      9,
    );
    assert.deepEqual(ranges, ["3-8"]);
  });

  it("matches chapterUid when one side is a string", () => {
    const ranges = ownBookmarkRangesForChapter(
      { updated: [{ chapterUid: 9, range: "3-8", type: 1 }] },
      "9",
    );
    assert.deepEqual(ranges, ["3-8"]);
  });

  it("picks this chapter's ranges from my thoughts", () => {
    const ranges = ownThoughtRangesForChapter(
      {
        reviews: [
          { review: { chapterUid: 9, range: "3-8" } },
          { review: { chapterUid: 8, range: "10-20" } },
          // 书评没有章节 range
          { review: { chapterUid: 9, range: "" } },
        ],
        updated: [{ chapterUid: 9, range: "30-40" }],
      },
      9,
    );
    assert.deepEqual(ranges, ["30-40", "3-8"]);
  });

  it("treats overlapping official ranges as a hit", () => {
    assert.equal(rangesOverlap("3-8", "3-8"), true);
    assert.equal(rangesOverlap("3-8", "6-12"), true);
    assert.equal(rangesOverlap("10-20", "3-8"), false);
    assert.equal(rangesOverlap("bad", "3-8"), false);
  });

  it("merges own ranges onto hot underlines without duplicating", () => {
    const merged = mergeUnderlineRanges(
      [{ range: "1-5", count: 12, type: 1 }],
      ["1-5", "10-20"],
    );
    assert.deepEqual(merged, [
      { range: "1-5", count: 12, type: 1 },
      { range: "10-20", count: 1, type: 1 },
    ]);
  });
});
