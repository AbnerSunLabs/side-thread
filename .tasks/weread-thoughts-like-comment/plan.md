# 微信读书热门想法点赞与阅读中点评 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阅读器热门想法可点赞、可在选中原文或热门划线下发表想法，全部走微信读书官方接口，同一账号在 App 可查。

**Architecture:** Webview 只发 `WEREAD_*` 消息。Host 用现有 `WeReadClient.execute` + Cookie 调官方 `web/review/like` 与 `web/review/add`（划线想法 `type=1`）。可见范围、赞状态切换、选区 HTML `range` 做成纯函数，供 Host 单测和 Webview 共用。

**Tech Stack:** VS Code Webview、React + antd、TypeScript、Mocha（`pnpm test` → `out/src/test/**/*.test.js`）。不新增生产依赖。

## Global Constraints

- 点赞和发表必须打到微信读书官方接口；插件不存第二份真源；同一账号在微信读书 App 可查。
- 「屏蔽好友」是官方能力（仅未关注你的人可见），走官方字段与官方文案，不自造隐私模型。
- 可见范围只在写想法时选择；每次打开输入框默认「屏蔽好友」；列表已有想法不打可见范围标签。
- 发想法为划线想法 `type=1`，带 `bookId`、`chapterUid`、`range`、`abstract`、正文、官方可见范围字段。
- `range` 按注入热门划线 `<span>` **之前**的章节 HTML（`chapterContent.html`）偏移计算；算不出则禁止发送。
- Webview 不直连微信读书；经 `WereadProvider` + `WeReadClient.execute`。
- 沿用现有热门想法 Popover，不改为 Drawer。
- 不新增生产依赖；不改书架、时长上报、状态栏；不做整本书评、改删想法、只划线。
- 空内容不可发送。失败：点赞回滚该条；发表保留输入；Cookie 失效走现有 `WEREAD_ERROR`。

## File Structure

- Create: `src/core/wereadThoughts.ts` — 可见范围映射、赞状态切换、热门想法条目解析
- Create: `src/core/wereadHtmlRange.ts` — 章节 HTML 文本偏移 ↔ `start-end` range，与现有划线注入同一套合法性
- Create: `src/test/wereadThoughts.test.ts`
- Create: `src/test/wereadHtmlRange.test.ts`
- Modify: `src/api/weread/api/review.ts` — `web_review_like`、`web_review_add_thought`；`ReviewAccessibility` 增加屏蔽好友
- Modify: `src/Providers/wereadProvider.ts` — `WEREAD_LIKE_THOUGHT`、`WEREAD_ADD_THOUGHT`
- Create: `weread/src/components/ThoughtComposer.tsx` — 输入框 + 官方四档选择器
- Modify: `weread/src/App.tsx` — 可点赞、Popover 底部写想法、选区「写想法」
- Modify: `weread/tsconfig.app.json`、`weread/vite.config.ts` — 允许 Webview 引用 `src/core` 纯函数
- Modify: `docs/prd/weread-thoughts-like-comment.md` — 实现后把状态改为已实现

---

### Task 1: 可见范围与赞状态纯函数

**Files:**
- Create: `src/core/wereadThoughts.ts`
- Test: `src/test/wereadThoughts.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `ThoughtVisibility = "public" | "friends" | "hideFromFriends" | "private"`
  - `DEFAULT_THOUGHT_VISIBILITY: ThoughtVisibility`（`"hideFromFriends"`）
  - `THOUGHT_VISIBILITY_LABEL: Record<ThoughtVisibility, string>`（公开 / 关注 / 屏蔽好友 / 私密）
  - `visibilityToAddPayload(visibility: ThoughtVisibility): Record<string, number>`
  - `applyLikeToggle(likeCount: number, liked: boolean, isLike: boolean): { likeCount: number; liked: boolean }`
  - `parseThoughtLiked(pageReview: unknown): boolean`
  - `parseThoughtLikeCount(pageReview: unknown): number`

官方 `web/review/add` 可见范围字段与现有 `web_review_add` 三档对齐，并补官方第四档：

| 档 | 文案 | payload |
|----|------|---------|
| `public` | 公开 | `{}` |
| `friends` | 关注 | `{ friendship: 1 }` |
| `hideFromFriends` | 屏蔽好友 | `{ notVisibleToFriends: 1 }` |
| `private` | 私密 | `{ isPrivate: 1 }` |

官方网页端 `web/review/add` 可见范围字段以 wrwebnjlogic 为准：`privateState=3` 发 `{ notVisibleToFriends: 1 }`（不是 `friendNotSee`）。公开 / 关注 / 私密仍是 `{}` / `{ friendship: 1 }` / `{ isPrivate: 1 }`。

- [ ] **Step 1: Write the failing test**

```typescript
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
      notVisibleToFriends: 1,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm compile-tests && pnpm exec mocha "out/src/test/wereadThoughts.test.js"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: Write minimal implementation**

```typescript
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
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm compile-tests && pnpm exec mocha "out/src/test/wereadThoughts.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/wereadThoughts.ts src/test/wereadThoughts.test.ts
git commit -m "$(cat <<'EOF'
feat: 对齐微信读书官方想法可见范围与点赞状态映射

EOF
)"
```

---

### Task 2: 章节 HTML 选区 range

**Files:**
- Create: `src/core/wereadHtmlRange.ts`
- Test: `src/test/wereadHtmlRange.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `htmlRangeFromTextOffsets(html: string, textStart: number, textEnd: number): string | null`
  - `canUseThoughtRange(html: string, range: string): boolean`
  - 返回格式 `"start-end"`，坐标相对传入的 `html`（调用方必须传注入划线 span **之前**的 `chapterContent.html`）

规则与现有 `injectUnderlines` 一致：range 不能落在标签内、不能跨越 `<>`。选区文本与 `html.slice(start,end)`（去标签后）不一致则返回 `null`。

- [ ] **Step 1: Write the failing test**

```typescript
import * as assert from "assert";
import { describe, it } from "mocha";
import {
  canUseThoughtRange,
  htmlRangeFromTextOffsets,
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm compile-tests && pnpm exec mocha "out/src/test/wereadHtmlRange.test.js"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: Write minimal implementation**

```typescript
function isInsideHtmlTag(html: string, index: number): boolean {
  const lastOpen = html.lastIndexOf("<", index);
  const lastClose = html.lastIndexOf(">", index);
  return lastOpen > lastClose;
}

function canInjectUnderlineRange(
  html: string,
  start: number,
  end: number,
): boolean {
  if (start < 0 || end > html.length || start >= end) return false;
  if (isInsideHtmlTag(html, start) || isInsideHtmlTag(html, end - 1)) {
    return false;
  }
  return !/[<>]/.test(html.slice(start, end));
}

export function canUseThoughtRange(html: string, range: string): boolean {
  const match = /^(\d+)-(\d+)$/.exec(range);
  if (!match) return false;
  return canInjectUnderlineRange(html, Number(match[1]), Number(match[2]));
}

export function htmlRangeFromTextOffsets(
  html: string,
  textStart: number,
  textEnd: number,
): string | null {
  if (textStart < 0 || textEnd <= textStart) return null;
  let textIdx = 0;
  let htmlStart = -1;
  let htmlEnd = -1;
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (inTag) {
      if (ch === ">") inTag = false;
      continue;
    }
    if (textIdx === textStart) htmlStart = i;
    textIdx += 1;
    if (textIdx === textEnd) {
      htmlEnd = i + 1;
      break;
    }
  }
  if (htmlStart < 0 || htmlEnd < 0) return null;
  if (!canInjectUnderlineRange(html, htmlStart, htmlEnd)) return null;
  return `${htmlStart}-${htmlEnd}`;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm compile-tests && pnpm exec mocha "out/src/test/wereadHtmlRange.test.js"`

Expected: PASS。若 `"3-8"` 与真实 `<p>hello` 下标不一致，按测试里 `html.slice` 断言修正下标，不要放宽测试。

- [ ] **Step 5: Commit**

```bash
git add src/core/wereadHtmlRange.ts src/test/wereadHtmlRange.test.ts
git commit -m "$(cat <<'EOF'
feat: 按章节 HTML 偏移计算划线想法 range

EOF
)"
```

---

### Task 3: Host 点赞与发划线想法 API

**Files:**
- Modify: `src/api/weread/api/review.ts`
- Modify: `src/test/wereadThoughts.test.ts`（追加 payload 组装用例，或新建 `src/test/wereadReviewApi.test.ts` 只测纯组装函数）

**Interfaces:**
- Consumes: `ThoughtVisibility`、`visibilityToAddPayload`（Task 1）
- Produces:
  - `ReviewAccessibility.HideFromFriends` 新增
  - `web_review_like(reviewId: string, isLike: boolean, cookie?: string): Promise<unknown>`
  - `web_review_add_thought(input: AddThoughtInput, cookie?: string): Promise<unknown>`
  - `buildReviewLikeBody(reviewId: string, isLike: boolean): { reviewId: string; isLike: 0 | 1 }`
  - `buildReviewAddThoughtBody(input: AddThoughtInput): Record<string, unknown>`

```typescript
export type AddThoughtInput = {
  bookId: string;
  chapterUid: number;
  chapterIdx?: number;
  range: string;
  abstract: string;
  content: string;
  visibility: ThoughtVisibility;
};
```

`web_review_add`（整本书评 `type=4`）行为保持不变。回包 `errCode` 非 0 且非鉴权码时抛出 `Error(errMsg)`，让 Provider 走 `WEREAD_ERROR`。

- [ ] **Step 1: Write the failing test**

在 `src/test/wereadReviewApi.test.ts`：

```typescript
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
    assert.equal(body.isPrivate, undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm compile-tests && pnpm exec mocha "out/src/test/wereadReviewApi.test.js"`

Expected: FAIL，导出不存在。

- [ ] **Step 3: Write minimal implementation**

在 `review.ts` 增加（保留原 `web_review_add`）：

```typescript
import {
  ThoughtVisibility,
  visibilityToAddPayload,
} from "../../core/wereadThoughts";

export enum ReviewAccessibility {
  Private,
  Friendship,
  Public,
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
  return { reviewId, isLike: isLike ? (1 as const) : (0 as const) };
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
  if (input.chapterIdx != null) body.chapterIdx = input.chapterIdx;
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
    { cookie },
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
    { cookie },
  );
  return assertReviewWriteOk(await resp.json());
}
```

`assertWeReadAuthenticated` 仍由 `postJSON` → `json()` 触发。这里只处理业务 `errCode`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm compile-tests && pnpm exec mocha "out/src/test/wereadReviewApi.test.js" "out/src/test/wereadThoughts.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/weread/api/review.ts src/test/wereadReviewApi.test.ts
git commit -m "$(cat <<'EOF'
feat: 接入微信读书官方点赞与划线想法发表接口

EOF
)"
```

---

### Task 4: Provider 消息

**Files:**
- Modify: `src/Providers/wereadProvider.ts`

**Interfaces:**
- Consumes: `web_review_like`、`web_review_add_thought`、Task 3 的 `AddThoughtInput`
- Produces:
  - `assertLikeThoughtPayload(payload: unknown): { reviewId: string; isLike: boolean }`
  - `assertAddThoughtPayload(payload: unknown): AddThoughtInput`
  - 处理 `WEREAD_LIKE_THOUGHT` → `WEREAD_LIKE_THOUGHT_RESULT`
  - 处理 `WEREAD_ADD_THOUGHT` → `WEREAD_ADD_THOUGHT_RESULT`
  - 现有 `WEREAD_BEST_THOUGHTS_DATA` 原样回传官方 JSON

失败继续走现有 `catch` → `WEREAD_ERROR`，不在 Provider 里吞掉。校验函数放在 `src/core/wereadThoughts.ts`，Provider 只调用。

- [ ] **Step 1: Write the failing test**

追加到 `src/test/wereadThoughts.test.ts`：

```typescript
import {
  assertAddThoughtPayload,
  assertLikeThoughtPayload,
} from "../core/wereadThoughts";

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
```

- [ ] **Step 2: 实现校验函数并接到 Provider**

在 `src/core/wereadThoughts.ts` 增加 `assertLikeThoughtPayload` 与 `assertAddThoughtPayload`（校验失败抛出「点赞参数无效」/「想法参数无效」，content 去空白）。

`wereadProvider.ts` import `web_review_like`、`web_review_add_thought`、两个 assert。在 `WEREAD_GET_BEST_THOUGHTS` 之后：

```typescript
        case "WEREAD_LIKE_THOUGHT": {
          const { reviewId, isLike } = assertLikeThoughtPayload(payload);
          await this.client.execute(web_review_like, reviewId, isLike);
          webviewView.webview.postMessage({
            command: "WEREAD_LIKE_THOUGHT_RESULT",
            payload: { reviewId, isLike },
          });
          break;
        }

        case "WEREAD_ADD_THOUGHT": {
          const input = assertAddThoughtPayload(payload);
          const result = await this.client.execute(
            web_review_add_thought,
            input,
          );
          webviewView.webview.postMessage({
            command: "WEREAD_ADD_THOUGHT_RESULT",
            payload: result,
          });
          break;
        }
```

- [ ] **Step 3: Run host tests**

Run: `pnpm test`

Expected: PASS，含新的 payload 校验用例。

- [ ] **Step 4: Commit**

```bash
git add src/core/wereadThoughts.ts src/test/wereadThoughts.test.ts src/Providers/wereadProvider.ts
git commit -m "$(cat <<'EOF'
feat: 阅读器 Host 转发想法点赞与发表

EOF
)"
```

---

### Task 5: Popover 点赞与底部写想法

**Files:**
- Create: `weread/src/components/ThoughtComposer.tsx`
- Modify: `weread/tsconfig.app.json` — `include` 增加 `../src/core/wereadThoughts.ts`
- Modify: `weread/vite.config.ts` — `resolve.alias`：`core-weread` → `path.resolve(__dirname, "../src/core")`
- Modify: `weread/src/App.tsx`

**Interfaces:**
- Consumes: `ThoughtVisibility`、`DEFAULT_THOUGHT_VISIBILITY`、`THOUGHT_VISIBILITY_LABEL`、`applyLikeToggle`、`parseThoughtLiked`、`parseThoughtLikeCount`
- Produces: 热门想法可点赞；Popover 底部写想法；成功插入列表顶部；失败回滚赞 / 保留输入

`ThoughtComposer` props：

```typescript
type ThoughtComposerProps = {
  submitting: boolean;
  onSubmit: (content: string, visibility: ThoughtVisibility) => void;
};
```

每次 `ThoughtComposer` mount 时 `useState(DEFAULT_THOUGHT_VISIBILITY)`，不要用提升后的父级记忆上次选择。用 `key={currentRange}` 强制重置。

- [ ] **Step 1: 允许 Webview 引用 core**

`weread/vite.config.ts` 增加：

```typescript
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // ...existing
  resolve: {
    alias: {
      "core-weread": path.resolve(rootDir, "../src/core"),
    },
  },
});
```

`weread/tsconfig.app.json` 的 `include` 改为 `["src", "../src/core/wereadThoughts.ts", "../src/core/wereadHtmlRange.ts"]`。

- [ ] **Step 2: 实现 ThoughtComposer**

```tsx
import { Button, Input, Select, Space } from "antd";
import { useState } from "react";
import {
  DEFAULT_THOUGHT_VISIBILITY,
  THOUGHT_VISIBILITY_LABEL,
  ThoughtVisibility,
} from "core-weread/wereadThoughts";

const OPTIONS: ThoughtVisibility[] = [
  "hideFromFriends",
  "public",
  "friends",
  "private",
];

export function ThoughtComposer({ submitting, onSubmit }: {
  submitting: boolean;
  onSubmit: (content: string, visibility: ThoughtVisibility) => void;
}) {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<ThoughtVisibility>(
    DEFAULT_THOUGHT_VISIBILITY,
  );
  const trimmed = content.trim();
  return (
    <div style={{ marginTop: 8 }}>
      <Input.TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写想法"
        autoSize={{ minRows: 2, maxRows: 4 }}
        disabled={submitting}
      />
      <Space style={{ marginTop: 8 }} wrap>
        <Select
          value={visibility}
          onChange={setVisibility}
          style={{ minWidth: 120 }}
          options={OPTIONS.map((value) => ({
            value,
            label: THOUGHT_VISIBILITY_LABEL[value],
          }))}
          disabled={submitting}
        />
        <span>{THOUGHT_VISIBILITY_LABEL[visibility]}</span>
        <Button
          type="primary"
          size="small"
          disabled={!trimmed || submitting}
          loading={submitting}
          onClick={() => onSubmit(trimmed, visibility)}
        >
          发送
        </Button>
      </Space>
    </div>
  );
}
```

- [ ] **Step 3: 改 App.tsx 想法数据与点赞**

`Thought` 增加 `liked: boolean`。

`WEREAD_BEST_THOUGHTS_DATA` 映射改为：

```typescript
import {
  applyLikeToggle,
  parseThoughtLikeCount,
  parseThoughtLiked,
} from "core-weread/wereadThoughts";
```

```typescript
liked: parseThoughtLiked(pr),
likeCount: parseThoughtLikeCount(pr),
```

点赞：点击图标 → 先 `applyLikeToggle` 更新 UI 并记录 `likingId` 禁用该条 → `vscode.postMessage({ command: "WEREAD_LIKE_THOUGHT", payload: { reviewId, isLike: !thought.liked } })`。

`WEREAD_LIKE_THOUGHT_RESULT`：清除 `likingId`。

`WEREAD_ERROR`：若 `likingId` 有值，对该条再 `applyLikeToggle(..., !pendingIsLike)` 回滚，并 `message.error`。用 ref 保存回滚所需 `{ reviewId, previous }`。

点赞图标：`liked ? <LikeFilled /> : <LikeOutlined />`。

Popover 底部在列表或空态下方渲染 `<ThoughtComposer key={activeRange} ... />`。`activeRange` 为当前点击的划线 `data-range`。空列表仍显示作曲器。

发送：`WEREAD_ADD_THOUGHT`，payload 含当前 `bookId`、`chapterUid`、`chapterIdx`（`parseChapterIdx(catalog[currentChapterIdx].chapterIdx)`）、`range`、`abstract`（划线原文：优先用想法列表第一条的 `abstract`，否则用 underline 文本 `underlineEl.textContent`，在 click 时存进 state）。

`WEREAD_ADD_THOUGHT_RESULT`：把新想法插到 `bestThoughts` 顶部。新条目字段从回包 `review` 读取；缺省用刚发送的 content、当前用户占位可省略头像，用回包 author。

发表中 `thoughtSubmitting`；失败只 toast，不清输入（Composer 自己保留 state，不要因 error 卸载 Composer）。

列表条目**不要**渲染可见范围标签。

- [ ] **Step 4: 构建 Webview 确认能编过**

Run: `pnpm --filter weread build`

Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add weread/src/components/ThoughtComposer.tsx weread/src/App.tsx weread/vite.config.ts weread/tsconfig.app.json
git commit -m "$(cat <<'EOF'
feat: 热门想法支持点赞并在划线下发表

EOF
)"
```

---

### Task 6: 选中正文写想法

**Files:**
- Modify: `weread/src/App.tsx`
- Modify: `docs/prd/weread-thoughts-like-comment.md`（状态改为已实现）

**Interfaces:**
- Consumes: `htmlRangeFromTextOffsets`、`canUseThoughtRange`、`ThoughtComposer`
- Produces: 选中非空文本后出现「写想法」；用 `chapterContent.html`（注入 span 前）算 range；成功关工具条并 toast

选区文本偏移：在 `.reader-content` 内对 `window.getSelection()` 走 `Range`，累计 **text node** 的 `data.length`（不要用注入后 HTML 字符串下标）。得到 `textStart/textEnd` 后：

```typescript
const range = htmlRangeFromTextOffsets(chapterContent.html, textStart, textEnd);
```

`mouseup` 且 selection 不空、不在 `.hot-underline` 点击路径上时，在选区 `getBoundingClientRect` 旁显示「写想法」按钮。点按钮打开第二个 Popover/小面板，内嵌 `ThoughtComposer key={selectionRange}`。

发送前：`canUseThoughtRange(chapterContent.html, range)` 为 false 则 `message.warning("无法定位这段原文，请换选一段")`，不发消息。

成功：`message.success("想法已发布")`，关闭工具条与选区 composer，`window.getSelection()?.removeAllRanges()`。不要给正文加「我的划线」span。

- [ ] **Step 1: 增加选区 → text offsets 辅助函数（放 App.tsx 或 `weread/src/utils/domTextOffsets.ts`）**

```typescript
function textOffsetsInRoot(root: HTMLElement, selection: Selection): {
  start: number;
  end: number;
  text: string;
} | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const text = range.toString();
  if (!text.trim()) return null;
  return { start, end: start + text.length, text };
}
```

注意：`Range.toString()` 与 `pre.toString()` 走的是 **渲染后文本**。`htmlRangeFromTextOffsets` 走的是 **原始 HTML 去标签文本**。二者在脚注替换后可能对不齐；对不齐时 `htmlRangeFromTextOffsets` 仍会给出一段 range，必须再校验 `chapterContent.html.slice(start,end)` 去标签后等于 `text`（忽略首尾空白）。不相等则当失败，提示换选。

在 `wereadHtmlRange.ts` 追加并补测：

```typescript
export function htmlSlicePlainText(html: string, start: number, end: number): string {
  return html.slice(start, end).replace(/<[^>]+>/g, "");
}
```

测试：`htmlSlicePlainText("<p>hello</p>", 3, 8) === "hello"`。

- [ ] **Step 2: 接上选区 UI 与 WEREAD_ADD_THOUGHT**

`abstract` 用选中文本。`range` 用算出的 `"start-end"`。其余与 Task 5 相同。选区成功走 `WEREAD_ADD_THOUGHT_RESULT` 时：若当前热门想法 Popover 未打开，只 toast + 关工具条；不要强行打开热门列表。

- [ ] **Step 3: Run host tests + weread build**

Run:

```bash
pnpm test
pnpm --filter weread build
```

Expected: 全绿。

- [ ] **Step 4: 更新 PRD 状态**

`docs/prd/weread-thoughts-like-comment.md` 表格「状态」改为 `已实现（待 App 手动核对）`。

- [ ] **Step 5: Commit**

```bash
git add weread/src/App.tsx src/core/wereadHtmlRange.ts src/test/wereadHtmlRange.test.ts docs/prd/weread-thoughts-like-comment.md
git commit -m "$(cat <<'EOF'
feat: 选中正文可发表划线想法

EOF
)"
```

---

## Spec coverage

| Spec 条目 | Task |
|-----------|------|
| 热门想法展示并可点赞/取消赞 | 1, 5 |
| 点赞后 App 一致 | 3（官方 like 接口）；手动核对 |
| Popover 底部写想法，成功置顶 | 5 |
| 选中正文写想法，成功关工具条 toast | 6 |
| 官方四档、默认屏蔽好友、每次打开重置、列表不打标签、空内容不可发 | 1, 5 |
| 屏蔽好友走官方字段 | 1, 3 |
| 发表后 App 可查、位置正确 | 3, 6 |
| Cookie 失效不假装成功 | 4（WEREAD_ERROR） |
| 点赞失败回滚；发表失败保留；range 失败不发送 | 2, 5, 6 |
| 不新增生产依赖 | 全局；vite alias 不是 npm 依赖 |
| Non-goals | 无对应实现任务 |

## Manual verification（自动化测不到 App）

1. 配置同一微信读书账号 Cookie，F5 跑扩展。
2. 打开一本书，点热门划线：能看到赞数；点赞后打开手机 App 同一想法，赞状态一致；再取消赞，App 跟着变。
3. 在 Popover 底部发一条（默认显示「屏蔽好友」），App「我的想法」或该段划线想法里能看到。
4. 改成「公开」再发一条，App 可见范围为公开。
5. 选中正文发想法，App 里挂在对应原文；故意选跨标签或选到脚注，插件提示换选且不发。
6. 清空输入时发送按钮不可用。
