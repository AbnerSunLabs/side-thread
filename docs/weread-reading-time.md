# 微信读书阅读时长（现役）

2026-08-14 起，插件内阅读会把真实时长上报到微信读书账号，APP「今日阅读」可以累计。书架、章节位置同步仍然独立存在。

权威以本文件和代码为准，不要再按 `docs/superpowers/plans/2026-08-14-weread-reading-time-sync.md` 里的旧切章上报描述实现。

## 用户能看到什么

- 打开书、正文到达后即开始计时，**同一章不翻页也会记**。
- 滚动、点击、按键视为在读。连续约 3 分钟无这些操作视为挂机，停止累计；再操作会恢复。
- 切走微信读书侧栏：暂停，离开期间不算；回来后继续。
- 回书架或关闭面板：结束会话，把未满 60 秒的余量最多再报一次。
- 上报全程静默，不再弹「进度已保存」。
- 需要已配置 `sidethread.wereadCookie`。APP 统计可能有短延迟，允许大约 ±1 分钟误差。
- 诊断日志在输出面板 **SideThread 微信读书**，筛选 `[Weread]`。

不做：章内精确进度（`percent` / `chapterOffset` 仍为 0）、插件内时长 UI、听书时长。

## 上报节点

打开章节只调用 `web_book_read_init` 建会话，**不带 `rt`**。真正把秒数写进账号的是后续 `web_book_read`（带 `rt`）。Host 每 15 秒 tick；未上报满 60 秒才打一枪，单次 `rt` 上限 60，不足 1 秒不上报。

| 节点         | 何时                      | 报多少                                        |
| ------------ | ------------------------- | --------------------------------------------- |
| 周期满 60 秒 | 侧栏可见、在读、未挂机    | 固定 60，余数留到下次                         |
| 挂机收尾     | 约 180 秒无滚动/点击/按键 | 宽限期内未报秒数一次报出（≤60），然后停止计时 |
| 切走侧栏     | 微信读书面板被隐藏        | 暂停计时；未满 60 的余量留在会话，不单独上报  |
| 切章         | 换到另一章，先停旧会话    | 旧章未报秒数一次 flush（≤60）                 |
| 回书架       | webview 发 `STOP`         | 同上                                          |
| 关掉面板     | webview `dispose`         | 同上                                          |

切章、回书架、关面板都走 `stop` → `flush`，不会连发补报。切走侧栏走 `pause`：只有 tick 判定已满 60 秒时才会带出那一枪，其余余量等回来或结束会话再结算。

不会上报：打开书/正文到达、滚动点击按键（只刷新「还在读」）、侧栏再显示（只 `resume`）、挂机后再操作（只唤醒）、同章反复 START（复用会话）、暂停期间未满 60 秒的余量。

## 实现要点

时钟在 Extension Host，Webview 只发生命周期消息。

| 项         | 值                                            |
| ---------- | --------------------------------------------- |
| Host tick  | 15 秒（`READ_TIME_TICK_MS`）                  |
| 周期上报   | 未上报满 60 秒报一次，单次 `rt` 上限 60       |
| 空闲       | 180 秒无 ACTIVITY；宽限期内仍计时，超时后停止 |
| 离开 flush | 只再报一次，`rt ≤ 60`，禁止连发补报           |

消息：`WEREAD_READ_SESSION_START` / `STOP` / `ACTIVITY`。START 同时携带章节 UID 和目录中的 `chapterIdx`；协议字段 `c` 使用 UID，`ci` 必须使用 `chapterIdx`，两者不能混用。

侧栏显隐不走消息，由 `WereadProvider` 听 `onDidChangeVisibility`：隐藏 `pause`（`pauseReason=visibility`，ACTIVITY 不能唤醒），显示 `resume`。空闲暂停后 ACTIVITY 可以唤醒。

`start()` 在 `web_book_read_init` 飞行中可被 `stop()` 取消（`startGeneration`），避免回书架后会话复活。

过期章节：`WEREAD_CHAPTER_DATA` 带 `bookId`/`chapterUid`，已离开阅读器或书/章对不上则丢弃。

`/web/book/read` 的成功响应可能只有 `succ` / `synckey`，不保证返回 `readerToken`。无 token 时使用当前 Web 阅读协议的兼容 token 生成 `sg`；不能因缺少 `readerToken` 放弃启动会话。

失败：init / report 失败只写入「SideThread 微信读书」输出日志，不打断阅读，不上报秒数回滚。只有明确的 `succ=1` 或 `synckey` 且没有非零错误码才视为成功，空对象和错误 JSON 不能记录成“上报完成”。

## 代码入口

| 文件                                 | 职责                                   |
| ------------------------------------ | -------------------------------------- |
| `src/api/weread/readSession.ts`      | 时钟纯函数 + `WereadReadReporter`      |
| `src/Providers/wereadProvider.ts`    | 接线、可见性、章节回包                 |
| `weread/src/hooks/useReadSession.ts` | 阅读器 START/STOP/ACTIVITY             |
| `src/api/weread/api/book.ts`         | `web_book_read_init` / `web_book_read` |
| `src/test/wereadReadSession.test.ts` | 单测                                   |

## 怎么跑

```bash
pnpm test
pnpm --filter weread build
pnpm dev   # 微信读书 Vite :5183，小宇宙并行
```
