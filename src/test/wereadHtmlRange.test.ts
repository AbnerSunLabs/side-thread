import * as assert from "assert";
import { describe, it } from "mocha";
import {
  canUseThoughtRange,
  displayedThoughtHtml,
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
      resolveDisplayedThoughtRange(html, displayedThoughtHtml(html, "epub"), {
        start: 0,
        end: 5,
        text: "hello",
      }),
      `${helloAt}-${helloAt + 5}`,
    );
    // 从文档开头数会落到标题，不能当 WeRead range
    assert.notEqual(htmlRangeFromTextOffsets(html, 0, 5), `${helloAt}-${helloAt + 5}`);
  });

  it("maps txt second-paragraph selection from wrapped display html, not a newline", () => {
    const raw = "hello\n\nworld";
    const original = prepareThoughtRangeHtml(raw, "txt");
    const displayed = displayedThoughtHtml(original, "txt");
    assert.equal(original, "hello\nworld");
    assert.equal(displayed, "<p>hello</p><p>world</p>");
    // Range.toString() 块级之间不插入 \n，「world」是展示层 [5,10]
    assert.equal(
      resolveDisplayedThoughtRange(original, displayed, {
        start: 5,
        end: 10,
        text: "world",
      }),
      "6-11",
    );
    assert.equal(original.slice(6, 11), "world");
    assert.equal(canUseThoughtRange(original, "6-11"), true);
    assert.equal(prepareThoughtRangeHtml("<p>hello</p>", "epub"), "<p>hello</p>");
  });

  it("maps pretty-print xhtml selection to original body indices", () => {
    const original = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<html>",
      "<head><title>第一章</title></head>",
      "<body>",
      "<p>hello</p>",
      "</body>",
      "</html>",
    ].join("\n");
    const displayed = displayedThoughtHtml(original, "epub");
    const helloAt = original.indexOf("hello");
    const displayText = displayed.replace(/<[^>]+>/g, "");
    const displayStart = displayText.indexOf("hello");
    assert.ok(displayStart > 0, "strip 后应留下 head/body 之间的换行");
    assert.equal(
      resolveDisplayedThoughtRange(original, displayed, {
        start: displayStart,
        end: displayStart + 5,
        text: "hello",
      }),
      `${helloAt}-${helloAt + 5}`,
    );
    assert.equal(original.slice(helloAt, helloAt + 5), "hello");
    assert.equal(canUseThoughtRange(original, `${helloAt}-${helloAt + 5}`), true);
    // 旧算法从 <body> 起按展示偏移数，会把换行算进去，trim 失败
    assert.equal(
      htmlRangeFromDisplayedTextOffsets(
        original,
        displayStart,
        displayStart + 5,
      ) === `${helloAt}-${helloAt + 5}`
        ? "same"
        : "mismatch",
      "mismatch",
    );
  });
});
