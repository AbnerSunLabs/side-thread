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
