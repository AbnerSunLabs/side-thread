import * as assert from "assert";
import { describe, it } from "mocha";
import {
  canUseThoughtRange,
  htmlRangeFromTextOffsets,
} from "../core/wereadHtmlRange";

describe("wereadHtmlRange", () => {
  it("maps text offsets to html range on a simple paragraph", () => {
    const html = "<p>hello world</p>";
    // "hello" 是去标签后的 [0,5]
    assert.equal(htmlRangeFromTextOffsets(html, 0, 5), "3-8");
    assert.equal(html.slice(3, 8), "hello");
  });

  it("rejects ranges that cut through tags", () => {
    const html = "<p>ab<b>cd</b></p>";
    // 文本 "abcd"；选 "bc" 会跨过 <b>
    assert.equal(htmlRangeFromTextOffsets(html, 1, 3), null);
  });

  it("rejects empty or inverted offsets", () => {
    assert.equal(htmlRangeFromTextOffsets("<p>ab</p>", 1, 1), null);
    assert.equal(htmlRangeFromTextOffsets("<p>ab</p>", 2, 1), null);
  });

  it("accepts the same range format as hot underlines", () => {
    assert.equal(canUseThoughtRange("<p>hello</p>", "3-8"), true);
    assert.equal(canUseThoughtRange("<p>hello</p>", "2-8"), false);
    assert.equal(canUseThoughtRange("<p>hello</p>", "nope"), false);
  });
});
