import * as assert from "assert";
import { describe, it } from "mocha";
import { overlayPosInScroller } from "../core/wereadOverlayPos";

describe("weread overlay pos", () => {
  it("places the overlay under the anchor inside a scrolled container", () => {
    const pos = overlayPosInScroller(
      { top: 80, left: 20, bottom: 680, scrollTop: 500, scrollLeft: 0 },
      { top: 240, left: 48, bottom: 260 },
    );
    assert.deepEqual(pos, { top: 680, left: 28 });
  });

  it("stays put in content coordinates when only the scroller moves", () => {
    const scroller = {
      top: 80,
      left: 20,
      bottom: 680,
      scrollTop: 500,
      scrollLeft: 0,
    };
    const first = overlayPosInScroller(scroller, {
      top: 240,
      left: 48,
      bottom: 260,
    });
    const afterScroll = overlayPosInScroller(
      { ...scroller, scrollTop: 560 },
      { top: 180, left: 48, bottom: 200 },
    );
    assert.deepEqual(afterScroll, first);
  });
});
