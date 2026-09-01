import {
    ThoughtVisibility,
    visibilityToAddPayload,
} from "../../../core/wereadThoughts";
import {get, postJSON} from "../utils/request";

// 评分
export enum ReviewRatingLevel {
    /**
     * 推荐
     */
    Good = 1,

    /**
     * 一般
     */
    Normal = 2,

    /**
     * 不行
     */
    Bad = 3,
}

// 可访问性
export enum ReviewAccessibility {
    /**
     * 私密，仅自己可见
     */
    Private,

    /**
     * 关注，仅互相关注可见
     */
    Friendship,

    /**
     * 公开，所有人可见
     */
    Public,

    /**
     * 屏蔽好友（官方 notVisibleToFriends）
     */
    HideFromFriends,
}

export type AddThoughtInput = {
    bookId: string;
    chapterUid: number;
    chapterIdx?: number;
    range: string;
    abstract: string;
    content: string;
    visibility: ThoughtVisibility;
};

export function buildReviewLikeBody(reviewId: string, isLike: boolean) {
    return {reviewId, isLike: isLike ? (1 as const) : (0 as const)};
}

export function buildReviewAddThoughtBody(input: AddThoughtInput) {
    const body: Record<string, unknown> = {
        bookId: input.bookId,
        content: input.content,
        type: 1,
        chapterUid: input.chapterUid,
        range: input.range,
        abstract: input.abstract,
        ...visibilityToAddPayload(input.visibility),
    };
    if (input.chapterIdx != null) {
        body.chapterIdx = input.chapterIdx;
    }
    return body;
}

function assertReviewWriteOk(data: any) {
    const code = data?.errCode;
    if (typeof code === "number" && code !== 0) {
        throw new Error(String(data.errMsg || "请求失败"));
    }
    return data;
}

export async function web_review_like(
    reviewId: string,
    isLike: boolean,
    cookie = "",
) {
    const resp = await postJSON(
        "https://weread.qq.com/web/review/like",
        buildReviewLikeBody(reviewId, isLike),
        {cookie},
    );
    return assertReviewWriteOk(await resp.json());
}

export async function web_review_add_thought(
    input: AddThoughtInput,
    cookie = "",
) {
    const resp = await postJSON(
        "https://weread.qq.com/web/review/add",
        buildReviewAddThoughtBody(input),
        {cookie},
    );
    return assertReviewWriteOk(await resp.json());
}


/**
 * 获取自己的评价
 * @description 获取之前需要先获取正确的synckey，只有正确的 synckey 才能进行正确的分页
 * @param bookId
 * @param startIdx 起始索引(从0开始)
 * @param count 数量
 * @param synckey
 * @param cookie
 */
export async function web_review_list_myself(bookId: string, startIdx = 0, count = 20, synckey = 0, cookie = "") {
    const resp = await get("https://weread.qq.com/web/review/list", {
        bookId: bookId,
        listType: 4, // todo: 11也可以获取自己的评价，目前不清楚他们的区别
        maxIdx: startIdx,
        count: count,
        listMode: 2,
        synckey: synckey,
    }, {cookie})
    return resp.json()
}

/**
 * 同步「我的想法」（官方 syncUserThoughts）
 * @description 官方阅读器发想法成功后调用它刷新划线；带 range 的想法本身就是一条划线
 * @param bookId
 * @param cookie
 */
export async function web_review_list_mine_notes(bookId: string, cookie = "") {
    const resp = await get("https://weread.qq.com/web/review/list", {
        bookId: bookId,
        listType: 11, // ReviewListTypeNote
        listMode: 2,
        mine: 1,
        synckey: 0,
    }, {cookie})
    return resp.json()
}

/**
 * 获取书评的 synckey
 * @param bookId
 */
export async function get_review_synckey(bookId: string) {
    return (await web_review_list(bookId, 0, 0, 0)).synckey
}

/**
 * 获取书籍的评价
 * @description 获取之前需要先获取正确的synckey，只有正确的 synckey 才能进行正确的分页
 * @param bookId
 * @param startIdx 起始索引(从0开始)
 * @param count 数量
 * @param synckey
 */
export async function web_review_list(bookId: string, startIdx = 0, count = 20, synckey = 0) {
    const resp = await get("https://weread.qq.com/web/review/list", {
        bookId: bookId,
        listType: 3,
        maxIdx: startIdx,
        count: count,
        listMode: 2,
        synckey: synckey,
    })
    return resp.json()
}


export async function web_review_single(reviewId: string, cookie = "") {
    const resp = await get("https://weread.qq.com/web/review/single", {
        reviewId,
    }, {
        cookie,
    })
    return resp.json()
}


/**
 * 添加评价
 * @param bookId
 * @param ratingLevel
 * @param accessibility
 * @param content
 * @param cookie
 */
export async function web_review_add(
    bookId: string,
    ratingLevel: ReviewRatingLevel,
    accessibility: ReviewAccessibility,
    content: string,
    cookie = ""
) {
    const payload: Record<string, any> = {
        bookId: bookId,
        content: content,
        newRatingLevel: ratingLevel,
        type: 4,
    }
    if (accessibility === ReviewAccessibility.Private) {
        payload.isPrivate = 1
    } else if (accessibility === ReviewAccessibility.Friendship) {
        payload.friendship = 1
    }

    const resp = await postJSON("https://weread.qq.com/web/review/add", payload, {cookie})
    return resp.json()
}
