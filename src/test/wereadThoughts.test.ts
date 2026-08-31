import * as assert from "assert";
import { describe, it } from "mocha";
import {
  DEFAULT_THOUGHT_VISIBILITY,
  THOUGHT_VISIBILITY_LABEL,
  applyLikeToggle,
  parseThoughtLikeCount,
  parseThoughtLiked,
  visibilityToAddPayload,
} from "../core/wereadThoughts";

describe("wereadThoughts", () => {
  it("defaults to official hide-from-friends visibility", () => {
    assert.equal(DEFAULT_THOUGHT_VISIBILITY, "hideFromFriends");
    assert.equal(THOUGHT_VISIBILITY_LABEL.hideFromFriends, "屏蔽好友");
    assert.equal(THOUGHT_VISIBILITY_LABEL.public, "公开");
    assert.equal(THOUGHT_VISIBILITY_LABEL.friends, "关注");
    assert.equal(THOUGHT_VISIBILITY_LABEL.private, "私密");
  });

  it("maps official visibility to web/review/add fields", () => {
    assert.deepEqual(visibilityToAddPayload("public"), {});
    assert.deepEqual(visibilityToAddPayload("friends"), { friendship: 1 });
    assert.deepEqual(visibilityToAddPayload("private"), { isPrivate: 1 });
    assert.deepEqual(visibilityToAddPayload("hideFromFriends"), {
      friendNotSee: 1,
    });
  });

  it("toggles like count without going negative", () => {
    assert.deepEqual(applyLikeToggle(12, false, true), {
      likeCount: 13,
      liked: true,
    });
    assert.deepEqual(applyLikeToggle(12, true, false), {
      likeCount: 11,
      liked: false,
    });
    assert.deepEqual(applyLikeToggle(0, false, false), {
      likeCount: 0,
      liked: false,
    });
    assert.deepEqual(applyLikeToggle(12, true, true), {
      likeCount: 12,
      liked: true,
    });
  });

  it("treats missing like flags as not liked", () => {
    assert.equal(parseThoughtLiked({}), false);
    assert.equal(parseThoughtLiked({ isLike: 1 }), true);
    assert.equal(parseThoughtLiked({ review: { isLike: 1 } }), true);
    assert.equal(parseThoughtLikeCount({ likesCount: 8 }), 8);
    assert.equal(parseThoughtLikeCount({}), 0);
  });
});
