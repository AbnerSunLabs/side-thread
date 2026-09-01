import * as assert from "assert";
import { describe, it } from "mocha";
import {
  injectUnderlines,
  textSegmentsInRange,
} from "../core/wereadUnderlineInject";

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

describe("weread underline inject", () => {
  it("wraps a range inside a single text run", () => {
    const html = "<p>hello world</p>";
    const start = html.indexOf("hello");
    const out = injectUnderlines(html, [
      { range: `${start}-${start + 5}`, count: 3, type: 1 },
    ]);
    assert.ok(out.includes('<span class="hot-underline" data-range="3-8">hello</span>'));
    assert.equal(plainText(out), "hello world");
  });

  it("wraps every text segment when the range crosses tags", () => {
    const html = "<p>abc<em>def</em>ghi</p>";
    const start = html.indexOf("abc");
    const end = html.indexOf("ghi") + 3;
    const out = injectUnderlines(html, [
      { range: `${start}-${end}`, count: 1, type: 1 },
    ]);
    const span = (text: string) =>
      `<span class="hot-underline" data-range="${start}-${end}">${text}</span>`;
    // span 必须落在 em 内外各自的文本上，不能跨过标签边界
    assert.equal(
      out,
      `<p>${span("abc")}<em>${span("def")}</em>${span("ghi")}</p>`,
    );
    assert.equal(plainText(out), "abcdefghi");
  });

  it("keeps text intact when the range starts inside a tag", () => {
    const html = "<p class='x'>abc</p>";
    const out = injectUnderlines(html, [{ range: "5-16", count: 1, type: 1 }]);
    assert.equal(plainText(out), "abc");
  });

  it("skips whitespace-only segments", () => {
    const html = "<p>a</p>\n<p>b</p>";
    const segments = textSegmentsInRange(html, 3, html.length);
    assert.deepEqual(
      segments.map(([s, e]) => html.slice(s, e)),
      ["a", "b"],
    );
  });

  it("injects multiple underlines without corrupting each other", () => {
    const html = "<p>abcdefghij</p>";
    const out = injectUnderlines(html, [
      { range: "3-6", count: 1, type: 1 },
      { range: "8-11", count: 2, type: 1 },
    ]);
    assert.equal(plainText(out), "abcdefghij");
    assert.equal(out.match(/class="hot-underline"/g)?.length, 2);
  });

  it("keeps the first range intact when two ranges overlap", () => {
    const html = "<p>abcdefghij</p>";
    const out = injectUnderlines(html, [
      { range: "3-10", count: 1, type: 1 },
      { range: "6-13", count: 2, type: 1 },
    ]);
    assert.equal(plainText(out), "abcdefghij");
    assert.equal(out.match(/class="hot-underline"/g)?.length, 1);
    assert.ok(out.includes('data-range="6-13"'));
  });

  it("ignores malformed ranges", () => {
    const html = "<p>abc</p>";
    assert.equal(injectUnderlines(html, [{ range: "x-y", count: 1, type: 1 }]), html);
  });
});
