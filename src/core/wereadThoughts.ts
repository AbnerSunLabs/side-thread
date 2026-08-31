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

const HIDE_FROM_FRIENDS_FIELD = "friendNotSee";

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
