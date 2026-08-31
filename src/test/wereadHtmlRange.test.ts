import * as assert from "assert";
import { describe, it } from "mocha";
import {
  canUseThoughtRange,
  htmlRangeFromDisplayedTextOffsets,
  htmlRangeFromTextOffsets,
  htmlSlicePlainText,
  prepareThoughtRangeHtml,
  resolveDisplayedThoughtRange,
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

  it("strips tags from an html slice", () => {
    assert.equal(htmlSlicePlainText("<p>hello</p>", 3, 8), "hello");
  });

  it("maps displayed body offsets to original html indices, skipping head title", () => {
    const html =
      "<html><head><title>第一章</title></head><body><p>hello</p></body></html>";
    const helloAt = html.indexOf("hello");
    // DOM 去掉 head 后 “hello” 是正文 [0,5]，range 仍是未 strip 的原始下标
    assert.equal(htmlRangeFromDisplayedTextOffsets(html, 0, 5), `${helloAt}-${helloAt + 5}`);
    assert.equal(html.slice(helloAt, helloAt + 5), "hello");
    assert.equal(
      resolveDisplayedThoughtRange(html, { start: 0, end: 5, text: "hello" }),
      `${helloAt}-${helloAt + 5}`,
    );
    // 从文档开头数会落到标题，不能当 WeRead range
    assert.notEqual(htmlRangeFromTextOffsets(html, 0, 5), `${helloAt}-${helloAt + 5}`);
  });

  it("maps txt selection against filtered newlines, not wrapped paragraphs", () => {
    const raw = "hello\n\nworld";
    const prepared = prepareThoughtRangeHtml(raw, "txt");
    assert.equal(prepared, "hello\nworld");
    assert.equal(
      resolveDisplayedThoughtRange(prepared, {
        start: 6,
        end: 11,
        text: "world",
      }),
      "6-11",
    );
    assert.equal(prepareThoughtRangeHtml("<p>hello</p>", "epub"), "<p>hello</p>");
  });
});
