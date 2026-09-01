import * as assert from "assert";
import { describe, it } from "mocha";
import {
  DEFAULT_THOUGHT_VISIBILITY,
  THOUGHT_VISIBILITY_LABEL,
  applyLikeToggle,
  assertAddThoughtPayload,
  assertLikeThoughtPayload,
  isMatchingThoughtRequest,
  mergeRangeThoughts,
  ownThoughtsMatchingRange,
  parseHotThoughts,
  parseThoughtLikeCount,
  parseThoughtLiked,
  parseThoughtRequestId,
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
      notVisibleToFriends: 1,
    });
    assert.equal(
      "friendNotSee" in visibilityToAddPayload("hideFromFriends"),
      false,
    );
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

  it("rejects invalid like and add payloads", () => {
    assert.throws(() => assertLikeThoughtPayload({}), /点赞参数无效/);
    assert.deepEqual(assertLikeThoughtPayload({ reviewId: "r1", isLike: true }), {
      reviewId: "r1",
      isLike: true,
    });
    assert.throws(() => assertAddThoughtPayload({ bookId: "b" }), /想法参数无效/);
    const add = assertAddThoughtPayload({
      bookId: "b1",
      chapterUid: 9,
      range: "3-8",
      abstract: "hello",
      content: "  想法  ",
      visibility: "hideFromFriends",
    });
    assert.equal(add.content, "想法");
  });

  it("matches add-thought results only when requestId is the in-flight one", () => {
    assert.equal(parseThoughtRequestId({ requestId: 3, review: {} }), 3);
    assert.equal(parseThoughtRequestId({ review: {} }), undefined);
    assert.equal(isMatchingThoughtRequest(2, { requestId: 2 }), true);
    assert.equal(isMatchingThoughtRequest(2, { requestId: 1 }), false);
    assert.equal(isMatchingThoughtRequest(2, { review: {} }), false);
    assert.equal(isMatchingThoughtRequest(null, { requestId: 1 }), false);
  });

  it("picks my thoughts whose range overlaps the clicked underline", () => {
    const own = ownThoughtsMatchingRange(
      {
        reviews: [
          {
            likesCount: 2,
            isLike: 1,
            review: {
              reviewId: "mine-1",
              chapterUid: 9,
              range: "3-8",
              content: "我的想法",
              abstract: "原文",
              author: { name: "我", avatar: "a.png" },
            },
          },
          {
            review: {
              reviewId: "other-ch",
              chapterUid: 8,
              range: "3-8",
              content: "别章",
              abstract: "原文",
              author: { name: "我", avatar: "a.png" },
            },
          },
        ],
      },
      9,
      "3-8",
    );
    assert.equal(own.length, 1);
    assert.equal(own[0].reviewId, "mine-1");
    assert.equal(own[0].content, "我的想法");
    assert.equal(own[0].liked, true);
    assert.equal(own[0].likeCount, 2);
  });

  it("puts my thoughts before hot thoughts and drops duplicates", () => {
    const hot = parseHotThoughts({
      reviews: [
        {
          pageReviews: [
            {
              likesCount: 9,
              review: {
                reviewId: "mine-1",
                content: "热门里的同一条",
                abstract: "原文",
                author: { name: "我", avatar: "a.png" },
              },
            },
            {
              likesCount: 4,
              review: {
                reviewId: "hot-1",
                content: "别人的",
                abstract: "原文",
                author: { name: "他", avatar: "b.png" },
              },
            },
          ],
        },
      ],
    });
    const own = [
      {
        reviewId: "mine-1",
        abstract: "原文",
        content: "我的想法",
        user: { name: "我", avatar: "a.png" },
        liked: false,
        likeCount: 0,
      },
    ];
    const merged = mergeRangeThoughts(own, hot);
    assert.deepEqual(
      merged.map(item => item.reviewId),
      ["mine-1", "hot-1"],
    );
    assert.equal(merged[0].content, "我的想法");
  });
});
