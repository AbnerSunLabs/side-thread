# 微信读书热门想法点赞与阅读中点评 — 设计

日期：2026-08-31（现役交互与 UI：2026-09-01）  
PRD：`docs/prd/weread-thoughts-like-comment.md`  
预览：`output/weread-thoughts-panel-demo.html`（已确认的视觉稿；实现为 `weread/src/style/thoughts.less`）

## 背景

2026-08-31 设计当时：点击热门划线能拉 `web_book_readReviews` 并展示 `likesCount`，点赞不可点，也不能发表；当时仓库里的 `web_review_add` 只覆盖整本书评 `type=4`。本设计只做划线想法这一层，不做整本书评列表。

现役代码已有划线想法 `web_review_add_thought`（官方 `/web/review/add`，`type=1`）与点赞。

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

沿用热门想法 Popover（`overlayClassName=thought-popover`），不改为 Drawer。`App.tsx` 里仍有一个 `open={false}` 的「热门想法」Drawer，不是现役入口。

点划线（热门或自己的）：按官方 `handleClickRange`，先展示与该 range 相交的自己的想法，再拼 `/web/book/readReviews` 的热门想法。列表标题「想法 · n」，条目为 20px 头像、昵称、正文（相对头像缩进）、右下可点赞和数字。空列表文案「暂无想法」。默认不出现输入框；底部「写想法」，点开后才出现输入框。请求中该条点赞禁用。发送成功插入列表顶部并收起输入框。列表条目不打可见范围标签。

选中正文：选区附近「写想法」，同一套 `ThoughtComposer`（textarea、官方四档、当前档文案、发送）。`range` 按展示 HTML（strip / TXT 包 `<p>`，注入划线 span 前）算文本偏移，再映射回未 strip 原文下标；算不出禁止发送并提示换选。成功后关掉工具条，toast。官方划选写想法只打 `/web/review/add`，划线由想法自带 `range` 渲染；阅读器按官方 `syncAllUserBookMark` 口径合并三路 range：热门划线、`bookmarklist`（我的划线）、`/web/review/list?listType=11&mine=1`（我的想法）。注入 `<span>` 时按标签边界逐段包裹。重叠 range 只留更宽的那条（通常是热门划线），点开时 `readReviews` 会带上与点击 range 相交的热门 range，避免只看到自己的想法。

可见范围：只在撰写控件上选择。默认「屏蔽好友」（`notVisibleToFriends`）。公开 / 关注 / 私密仍是 `{}` / `{ friendship: 1 }` / `{ isPrivate: 1 }`。禁止自造字段名或伴随划线接口。

颜色：跟 VS Code 主题 CSS 变量。主按钮、输入焦点、Select 选中项用 `--vscode-button-background`（部分主题 `--vscode-focusBorder` 与编辑器背景同色）。点赞用 `--vscode-editor-foreground`，不用 antd 默认蓝或 `textLink`。主题 token 只包在 `ThoughtComposer` 的 `ThoughtTheme` 里，不改全书 `ThemeWrapper`。

## 失败与验收

未登录 / Cookie 失效：现有登录失效提示，不假装成功。点赞失败回滚该条。发表失败保留输入。列表拉取失败不影响正文。

验收必须包含：插件点赞、发表后，同一账号在微信读书 App 可查，行为与官方一致。

## 测试

单测：可见范围官方四档映射（含屏蔽好友）、赞状态切换、非法 `range` 不可发送、pretty-print XHTML / TXT 包 `<p>` 的选区映射、发表 `requestId` 错配丢弃。  
手动：插件操作后打开微信读书 App 核对。
