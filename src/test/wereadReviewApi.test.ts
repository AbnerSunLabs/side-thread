import * as assert from "assert";
import { describe, it } from "mocha";
import {
  buildReviewAddThoughtBody,
  buildReviewLikeBody,
} from "../api/weread/api/review";

describe("weread review write payloads", () => {
  it("builds like body with official isLike flag", () => {
    assert.deepEqual(buildReviewLikeBody("r1", true), {
      reviewId: "r1",
      isLike: 1,
    });
    assert.deepEqual(buildReviewLikeBody("r1", false), {
      reviewId: "r1",
      isLike: 0,
    });
  });

  it("builds type-1 thought body with hide-from-friends by default field", () => {
    const body = buildReviewAddThoughtBody({
      bookId: "b1",
      chapterUid: 9,
      chapterIdx: 2,
      range: "3-8",
      abstract: "hello",
      content: "想法",
      visibility: "hideFromFriends",
    });
    assert.equal(body.type, 1);
    assert.equal(body.bookId, "b1");
    assert.equal(body.chapterUid, 9);
    assert.equal(body.chapterIdx, 2);
    assert.equal(body.range, "3-8");
    assert.equal(body.abstract, "hello");
    assert.equal(body.content, "想法");
    assert.equal(body.notVisibleToFriends, 1);
    assert.equal(body.friendNotSee, undefined);
    assert.equal(body.isPrivate, undefined);
  });
});
