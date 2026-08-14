# TouchFish 小宇宙

编辑器内的小宇宙播客客户端，由主扩展 `xiaoyuzhouProvider` 转发接口。

## 能力

- 发现页、订阅列表、收件箱
- 节目 / 单集详情、Shownotes
- 订阅 / 取消订阅
- 播放进度同步、状态栏字幕

开发端口：**5178**。根目录执行 `pnpm --filter xiaoyuzhou dev` 或 `pnpm dev`。

## 脚本

| 命令         | 说明               |
| ------------ | ------------------ |
| `pnpm dev`   | Vite 开发服务      |
| `pnpm build` | 生产构建到 `dist/` |
| `pnpm lint`  | ESLint             |

## 结构

```
src/
├── components/    # 播放条、抽屉等
├── hooks/         # 播客 API 与播放逻辑
├── store/         # 播放状态
├── style/
└── utils/
```
