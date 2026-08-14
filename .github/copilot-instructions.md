## TouchFish 协作速记

仓库现役能力是 **微信读书 + 小宇宙**。`package.json` 的 `activationEvents` 为 `onView:weread`、`onView:xiaoyuzhou`。不要按旧的微博/知乎/新闻树管线往下加功能。

- **入口**：`src/extension.ts` 懒加载 `WereadProvider`、`XiaoyuzhouProvider`。新视图要同步 `package.json` 的 `views` / `commands`。
- **配置**：Cookie/Token 经 `setConfigByKey`（`src/core/config.ts`）写用户级设置。微信读书用 `touchfish.wereadCookie`。
- **Webview**：公共逻辑在 `src/Providers/baseWebviewProvider.ts`。开发模式走 Vite：小宇宙 **5178**、微信读书 **5183**。生产构建：`pnpm build-webviews` 产出 `weread/dist`、`xiaoyuzhou/dist`。
- **本地联调**：`pnpm dev` 并行两个 Vite，主扩展 F5。
- **微信读书时长**：Host 时钟在 `src/api/weread/readSession.ts`，Webview 只发 `WEREAD_READ_SESSION_START` / `STOP` / `ACTIVITY`。同一章不翻页也计时；180s 无操作停止；侧栏隐藏 pause。现役说明：`docs/weread-reading-time.md`。不要恢复切章固定 `rt=60` 或「进度已保存」toast。
- **测试**：`pnpm test` → `compile-tests` + `compile` + `lint`，Mocha 在 `src/test/*.test.ts`，输出 `out/src/test/`。时长相关补 `src/test/wereadReadSession.test.ts`。
- **发布**：`pnpm changelog` 走 [Conventional Commits](https://www.conventionalcommits.org/) + SemVer（`feat`→次版本，`fix`→补丁）。`vsce package` 使用根目录 `package.json` 的 version；`weread`/`xiaoyuzhou` 的 version 由 `.versionrc` 同步，不要长期停在 `0.0.1`。`pnpm build-publish` 为 webview build → webpack → changelog → vsce/ovsx。
- **异常**：失败用中文提示；时长上报失败只 `console.error`，不打断阅读。
