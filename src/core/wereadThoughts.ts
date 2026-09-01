import { rangesOverlap, sameChapterUid } from "./wereadBookmarks";

export type ThoughtVisibility =
  | "public"
  | "friends"
  | "hideFromFriends"
  | "private";

export const DEFAULT_THOUGHT_VISIBILITY: ThoughtVisibility = "hideFromFriends";

export const THOUGHT_VISIBILITY_LABEL: Record<ThoughtVisibility, string> = {
  public: "公开",
  friends: "关注",
  hideFromFriends: "屏蔽好友",
  private: "私密",
};

const HIDE_FROM_FRIENDS_FIELD = "notVisibleToFriends";

export function visibilityToAddPayload(
  visibility: ThoughtVisibility,
): Record<string, number> {
  switch (visibility) {
    case "friends":
      return { friendship: 1 };
    case "private":
      return { isPrivate: 1 };
    case "hideFromFriends":
      return { [HIDE_FROM_FRIENDS_FIELD]: 1 };
    case "public":
      return {};
  }
}

export function applyLikeToggle(
  likeCount: number,
  liked: boolean,
  isLike: boolean,
): { likeCount: number; liked: boolean } {
  if (liked === isLike) {
    return { likeCount, liked };
  }
  if (isLike) {
    return { likeCount: likeCount + 1, liked: true };
  }
  return { likeCount: Math.max(0, likeCount - 1), liked: false };
}

export function parseThoughtLiked(pageReview: unknown): boolean {
  if (!pageReview || typeof pageReview !== "object") return false;
  const row = pageReview as Record<string, unknown>;
  if (row.isLike === 1 || row.isLike === true) return true;
  const review = row.review;
  if (review && typeof review === "object") {
    const inner = review as Record<string, unknown>;
    if (inner.isLike === 1 || inner.isLike === true) return true;
  }
  return false;
}

export function parseThoughtLikeCount(pageReview: unknown): number {
  if (!pageReview || typeof pageReview !== "object") return 0;
  const count = (pageReview as Record<string, unknown>).likesCount;
  return typeof count === "number" && count > 0 ? count : 0;
}

const THOUGHT_VISIBILITIES: ReadonlySet<string> = new Set([
  "public",
  "friends",
  "hideFromFriends",
  "private",
]);

export function parseThoughtRequestId(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const id = (payload as { requestId?: unknown }).requestId;
  return typeof id === "number" && Number.isFinite(id) ? id : undefined;
}

export function isMatchingThoughtRequest(
  pendingId: number | null | undefined,
  payload: unknown,
): boolean {
  const incoming = parseThoughtRequestId(payload);
  return pendingId != null && incoming != null && pendingId === incoming;
}

export function assertLikeThoughtPayload(payload: unknown): {
  reviewId: string;
  isLike: boolean;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("点赞参数无效");
  }
  const { reviewId, isLike } = payload as Record<string, unknown>;
  if (typeof reviewId !== "string" || !reviewId || typeof isLike !== "boolean") {
    throw new Error("点赞参数无效");
  }
  return { reviewId, isLike };
}

export type AddThoughtPayload = {
  bookId: string;
  chapterUid: number;
  chapterIdx?: number;
  range: string;
  abstract: string;
  content: string;
  visibility: ThoughtVisibility;
};

export function assertAddThoughtPayload(payload: unknown): AddThoughtPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("想法参数无效");
  }
  const row = payload as Record<string, unknown>;
  const { bookId, chapterUid, range, abstract, content, visibility, chapterIdx } =
    row;
  if (
    typeof bookId !== "string" ||
    !bookId ||
    typeof chapterUid !== "number" ||
    !Number.isFinite(chapterUid) ||
    typeof range !== "string" ||
    typeof abstract !== "string" ||
    typeof content !== "string" ||
    typeof visibility !== "string" ||
    !THOUGHT_VISIBILITIES.has(visibility)
  ) {
    throw new Error("想法参数无效");
  }
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("想法参数无效");
  }
  const result: AddThoughtPayload = {
    bookId,
    chapterUid,
    range,
    abstract,
    content: trimmed,
    visibility: visibility as ThoughtVisibility,
  };
  if (chapterIdx !== undefined) {
    if (typeof chapterIdx !== "number" || !Number.isFinite(chapterIdx)) {
      throw new Error("想法参数无效");
    }
    result.chapterIdx = chapterIdx;
  }
  return result;
}

export type RangeThought = {
  reviewId: string;
  abstract: string;
  content: string;
  user: { name: string; avatar: string };
  liked: boolean;
  likeCount: number;
};

function unwrapReviewRow(item: unknown): {
  review: Record<string, unknown>;
  liked: boolean;
  likeCount: number;
} | null {
  if (!item || typeof item !== "object") return null;
  const wrapped = (item as { review?: unknown }).review;
  const review = (
    wrapped && typeof wrapped === "object" ? wrapped : item
  ) as Record<string, unknown>;
  const reviewId = review.reviewId;
  if (typeof reviewId !== "string" || !reviewId) return null;
  return {
    review,
    liked: parseThoughtLiked(item),
    likeCount: parseThoughtLikeCount(item),
  };
}

export function parseThoughtFromReviewRow(item: unknown): RangeThought | null {
  const unwrapped = unwrapReviewRow(item);
  if (!unwrapped) return null;
  const { review, liked, likeCount } = unwrapped;
  const author =
    review.author && typeof review.author === "object"
      ? (review.author as Record<string, unknown>)
      : {};
  return {
    reviewId: String(review.reviewId),
    abstract: typeof review.abstract === "string" ? review.abstract : "",
    content: typeof review.content === "string" ? review.content : "",
    user: {
      name: typeof author.name === "string" ? author.name : "",
      avatar: typeof author.avatar === "string" ? author.avatar : "",
    },
    liked,
    likeCount,
  };
}

function reviewRowsFromList(reviewList: unknown): unknown[] {
  if (!reviewList || typeof reviewList !== "object") return [];
  const source = reviewList as { updated?: unknown; reviews?: unknown };
  return [
    ...(Array.isArray(source.updated) ? source.updated : []),
    ...(Array.isArray(source.reviews) ? source.reviews : []),
  ];
}

/** 官方 getSelfThoughtsByRangeOfChapter：本章且与点击 range 相交的自己的想法 */
export function ownThoughtsMatchingRange(
  reviewList: unknown,
  chapterUid: number | string,
  range: string,
): RangeThought[] {
  const thoughts: RangeThought[] = [];
  for (const item of reviewRowsFromList(reviewList)) {
    if (!item || typeof item !== "object") continue;
    const wrapped = (item as { review?: unknown }).review;
    const row = (
      wrapped && typeof wrapped === "object" ? wrapped : item
    ) as {
      chapterUid?: unknown;
      range?: unknown;
    };
    if (!sameChapterUid(row.chapterUid, chapterUid)) continue;
    if (!rangesOverlap(row.range, range)) continue;
    const thought = parseThoughtFromReviewRow(item);
    if (thought) thoughts.push(thought);
  }
  return thoughts;
}

/** 官方 /web/book/readReviews 回包里的 pageReviews */
export function parseHotThoughts(payload: unknown): RangeThought[] {
  if (!payload || typeof payload !== "object") return [];
  const reviews = (payload as { reviews?: unknown }).reviews;
  if (!Array.isArray(reviews)) return [];
  const thoughts: RangeThought[] = [];
  for (const group of reviews) {
    if (!group || typeof group !== "object") continue;
    const pageReviews = (group as { pageReviews?: unknown }).pageReviews;
    if (!Array.isArray(pageReviews)) continue;
    for (const row of pageReviews) {
      const thought = parseThoughtFromReviewRow(row);
      if (thought) thoughts.push(thought);
    }
  }
  return thoughts;
}

/** 官方 handleClickRange：自己的想法在前，热门想法在后，按 reviewId 去重 */
export function mergeRangeThoughts(
  own: RangeThought[],
  hot: RangeThought[],
): RangeThought[] {
  const seen = new Set<string>();
  const merged: RangeThought[] = [];
  for (const thought of [...own, ...hot]) {
    if (!thought.reviewId || seen.has(thought.reviewId)) continue;
    seen.add(thought.reviewId);
    merged.push(thought);
  }
  return merged;
}
