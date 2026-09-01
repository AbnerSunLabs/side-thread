## SideThread 协作速记

仓库现役能力是 **微信读书 + 小宇宙**。`package.json` 的 `activationEvents` 为 `onView:weread`、`onView:xiaoyuzhou`。不要按旧的微博/知乎/新闻树管线往下加功能。

- **入口**：`src/extension.ts` 懒加载 `WereadProvider`、`XiaoyuzhouProvider`。新视图要同步 `package.json` 的 `views` / `commands`。
- **配置**：Cookie/Token 经 `setConfigByKey`（`src/core/config.ts`）写用户级设置。微信读书用 `sidethread.wereadCookie`。
- **Webview**：公共逻辑在 `src/Providers/baseWebviewProvider.ts`。开发模式走 Vite：小宇宙 **5178**、微信读书 **5183**。生产构建：`pnpm build-webviews` 产出 `weread/dist`、`xiaoyuzhou/dist`。
- **本地联调**：`pnpm dev` 并行两个 Vite，主扩展 F5。
- **微信读书时长**：Host 时钟在 `src/api/weread/readSession.ts`，Webview 只发 `WEREAD_READ_SESSION_START` / `STOP` / `ACTIVITY`。同一章不翻页也计时；180s 无操作停止；侧栏隐藏 pause。现役说明：`docs/weread-reading-time.md`。不要恢复切章固定 `rt=60` 或「进度已保存」toast。
- **微信读书想法**：点赞与发表走官方 `/web/review/like`、`/web/review/add`（划线想法 `type=1`）。「屏蔽好友」字段是 `notVisibleToFriends`，不是自造名。官方划选写想法不另打划线接口。现役说明：`docs/superpowers/specs/2026-08-31-weread-thoughts-like-comment-design.md`。面板样式用 `--vscode-*`（主色/焦点用 `button.background`），不要 antd 默认蓝；可见范围只出现在撰写控件旁。
- **测试**：`pnpm test` → `compile-tests` + `compile` + `lint`，Mocha 在 `src/test/*.test.ts`，输出 `out/src/test/`。时长相关补 `src/test/wereadReadSession.test.ts`。
- **发布**：本地打包一条命令 `pnpm vsix`（webview → webpack → vsce）。`pnpm changelog` 走 Conventional Commits + SemVer。`weread`/`xiaoyuzhou` 的 version 由 `.versionrc` 同步。`pnpm build-publish` 为 `pnpm vsix` → changelog → vsce/ovsx。
- **异常**：失败用中文提示；时长上报失败只 `console.error`，不打断阅读。
