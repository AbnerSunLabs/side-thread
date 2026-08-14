# 更新历史

## [17.10.0](https://github.com/AbnerSunLabs/side-thread/releases/tag/v17.10.0) (2026-08-14)

### ❤️ Code Refactoring | 代码重构

- 精简为微信读书与小宇宙双平台并修复划线截断 ([c6936d8](https://github.com/AbnerSunLabs/side-thread/commit/c6936d8))

### ✨ Features | 新功能

- 微信读书 Host 侧接入阅读时长会话 ([911bdce](https://github.com/AbnerSunLabs/side-thread/commit/911bdce))
- 微信读书阅读器按真实阅读生命周期上报时长 ([3bcb52f](https://github.com/AbnerSunLabs/side-thread/commit/3bcb52f))
- 新增微信读书阅读时长上报会话 ([c5f79eb](https://github.com/AbnerSunLabs/side-thread/commit/c5f79eb))
- 新增微信读书阅读时长时钟纯函数 ([95fffd8](https://github.com/AbnerSunLabs/side-thread/commit/95fffd8))

### 🐰 Bug Fixes | Bug 修复

- 修正微信读书时长上报的章节索引与成功判定 ([e9e8ce8](https://github.com/AbnerSunLabs/side-thread/commit/e9e8ce8))
- 修复阅读时长会话竞态并区分空闲与侧栏隐藏 ([e0010ae](https://github.com/AbnerSunLabs/side-thread/commit/e0010ae))
- 修正 flushSession 少报时长并加强空闲断言 ([a2afcd1](https://github.com/AbnerSunLabs/side-thread/commit/a2afcd1))
- 修正 flushSession 空闲边界并补充 Reporter 状态机测试 ([38a61f8](https://github.com/AbnerSunLabs/side-thread/commit/38a61f8))

### 📑 Documentation | 文档

- 补充微信读书时长上报节点与现役协议说明
- 按双平台现役能力更新说明与更改日志 ([637f01b](https://github.com/AbnerSunLabs/side-thread/commit/637f01b))
- 补充微信读书阅读时长同步说明 ([9fc4be4](https://github.com/AbnerSunLabs/side-thread/commit/9fc4be4))

### 📝 Chores | 其他更新

- 发版时同步 webview 包版本并明确 SemVer 约定 ([b011759](https://github.com/AbnerSunLabs/side-thread/commit/b011759))
