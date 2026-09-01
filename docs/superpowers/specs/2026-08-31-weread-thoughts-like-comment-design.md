# 微信读书热门想法点赞与阅读中点评 — 设计

日期：2026-08-31  
规格：`.tasks/weread-thoughts-like-comment/spec.md`  
PRD：`docs/prd/weread-thoughts-like-comment.md`

## 背景

阅读器点击热门划线已能拉取 `web_book_readReviews` 并展示 `likesCount`，点赞不可点，也不能发表想法。`web_review_add` 仅覆盖整本书评 `type=4`。本设计只做热门想法这一层，不做整本书评列表。

## 架构

Webview 只发 `WEREAD_*` 消息，不直连微信读书。Host（`WereadProvider` + `WeReadClient.execute`）用现有 Cookie 续期调用官方接口。点赞和发表的数据源是微信读书账号，插件不存第二份真源。

| 能力          | 行为                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| 点赞 / 取消赞 | 官方点赞接口，按 `reviewId` 切换                                                            |
| 发划线想法    | 官方写想法；`type=1`，带 `chapterUid`、`range`、`abstract`                                  |
| 可见范围      | 官方四档：公开 / 关注 / 屏蔽好友 / 私密。默认屏蔽好友。屏蔽好友字段为 `notVisibleToFriends` |

消息：

- `WEREAD_GET_BEST_THOUGHTS`：补齐点赞数、当前用户是否已赞（没有已赞字段则按未赞展示）。
- `WEREAD_LIKE_THOUGHT` / `WEREAD_ADD_THOUGHT`：成功回写当前列表；失败走 `WEREAD_ERROR`。

不做：整本书评、改已有想法、删想法、打星、新依赖、Drawer。

## 阅读器交互

沿用热门想法 Popover。

点划线（热门或自己的）：按官方 `handleClickRange`，先展示 `getSelfThoughtsByRangeOfChapter` 里与该 range 相交的自己的想法，再拼 `/web/book/readReviews` 的热门想法。列表为头像、昵称、正文、可点赞和数字。默认不出现输入框；底部「写想法」，点开后才出现输入框。请求中该条点赞禁用。发送成功插入列表顶部并收起输入框。

选中正文：选区附近「写想法」，同一套输入框与可见范围选择，带上选中原文。`range` 按展示 HTML（strip / TXT 包 `<p>`，注入划线 span 前）算文本偏移，再映射回未 strip 原文下标，与热门划线同一套坐标；算不出禁止发送并提示换选。成功后关掉工具条，toast。官方划选写想法只打 `/web/review/add`，划线由想法自带 `range` 渲染，所以阅读器按官方 `syncAllUserBookMark` 的口径合并三路 range：热门划线、`bookmarklist`（我的划线）、`/web/review/list?listType=11&mine=1`（我的想法）。注入 `<span>` 时按标签边界逐段包裹，跨标签选区也能画出线。

可见范围：只在写想法时选择。输入区旁显示当前将要发出的档。列表已有想法不打可见范围标签。「屏蔽好友」用官方文案与官方能力（仅未关注你的人可见）。

## 失败与验收

未登录 / Cookie 失效：现有登录失效提示，不假装成功。点赞失败回滚该条。发表失败保留输入。列表拉取失败不影响正文。

验收必须包含：插件点赞、发表后，同一账号在微信读书 App 可查，行为与官方一致。

## 测试

单测：可见范围官方四档映射（含屏蔽好友）、赞状态切换、非法 `range` 不可发送、pretty-print XHTML / TXT 包 `<p>` 的选区映射、发表 `requestId` 错配丢弃。  
手动：插件操作后打开微信读书 App 核对。
