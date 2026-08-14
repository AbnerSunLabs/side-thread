<div align="center">

<img src="https://oss.qmsznj.com/prod/2025/08/13/ab941352-929e-4e5b-92c8-90e76b547f4c_20250813171917A269.png" width="200" height="200" alt="TouchFish Logo">

# TouchFish

**一款专为打工人设计的 VS Code / Cursor 摸鱼插件：在编辑器里读微信读书、听小宇宙播客。**

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/ylw.touchfish?style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=ylw.touchfish)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/ylw.touchfish?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ylw.touchfish)
[![Ratings](https://img.shields.io/visual-studio-marketplace/r/ylw.touchfish?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ylw.touchfish)

</div>

> [!Important]
> 已经开源,欢迎Star 本项目: [https://github.com/ylw1997/touchFish](https://github.com/ylw1997/touchFish)

## 🔥open-vsx 地址

**Cursor、Trae、CodeBuddy、Qorder、Antigravity市场链接**

https://open-vsx.org/extension/ylw/touchfish

## ✨ 核心功能

- **微信读书**: 书架同步、阅读进度云同步、**阅读时长同步到微信读书账号**、章节目录、划线与热门想法、自定义字体。同一章不翻页也会记时长；约 3 分钟无滚动/点击视为挂机。机制说明见 [docs/weread-reading-time.md](docs/weread-reading-time.md)。
- **小宇宙播客**: 发现页、订阅列表、收件箱、节目/单集详情、订阅/取消订阅、播放进度同步、Shownotes、状态栏字幕。
- **主题适配**: 界面跟随编辑器亮色/暗色主题。
- **开关**: `touchfish.enableWeread` / `touchfish.enableXiaoyuzhou` 可分别关闭模块。

## 🚀 功能展示

#### 🎙️ 小宇宙播客

![xiaoyuzhou](https://github.com/user-attachments/assets/2a13d8e5-0b5d-4179-97cd-4fb614743187)

### 📗 微信读书

![weread](https://github.com/user-attachments/assets/9146d4e5-e1e1-4372-a7de-20c6952c3bff)

### 🎮 暗色主题

![主题](https://oss.qmsznj.com/prod/2025/08/13/800c066c-bce9-4041-a6d0-fbb1bf459855_20250813173043A282.png)

## 🛠️ 安装

1. 打开 **编辑器**。
2. 进入 **扩展** 视图 (`Ctrl+Shift+X`)。
3. 搜索 `TouchFish`。
4. 点击 **安装**。

或者，[直接访问 Marketplace](https://marketplace.visualstudio.com/items?itemName=ylw.touchfish)。

## ⚙️ 配置与使用

### 快捷配置

1. 打开 **微信读书** 或 **小宇宙** 视图。
2. 点击视图右上角的 **齿轮图标 (⚙️)**。
3. 按提示粘贴微信读书 Cookie，或完成小宇宙登录。

### 手动配置

在设置中 (`Ctrl+,`) 搜索 `touchfish`：

- `touchfish.wereadCookie`: 微信读书 Cookie（书架、进度、阅读时长同步都依赖它）。
- `touchfish.xiaoyuzhouAccessToken` / `touchfish.xiaoyuzhouRefreshToken`: 小宇宙令牌（也可短信登录，不必手填）。
- `touchfish.xiaoyuzhouStatusBarShowLyric`: 状态栏显示播客字幕（关闭则显示标题）。
- `touchfish.enableWeread` / `touchfish.enableXiaoyuzhou`: 是否启用对应模块。
- `touchfish.fontSize`: 全局字体大小。
- `touchfish.showImg`: 是否显示图片。

## ⚠️ 注意事项

- **微信读书 Cookie**: 未配置时仍可打开阅读器，但进度和时长不会同步到 APP。
- **小宇宙**: 支持手机短信验证码登录，无需手动配 Cookie。
- **播客没有声音**：编辑器内置的 Electron 可能缺少 AAC 等音频解码器。替换插件或调音量无效，需要给**实际运行 TouchFish 的编辑器**安装与其 Electron 版本一致的 FFmpeg。

  > [!WARNING]
  > 操作前请完全退出编辑器（包括后台进程）。脚本会修改编辑器安装目录；macOS 还会用 ad-hoc 签名替换应用的官方签名。请确认你理解风险后再执行。重新安装编辑器可以恢复官方文件和签名。

  **先检查，不修改文件**

  Windows PowerShell：

  ```powershell
  Invoke-RestMethod https://raw.githubusercontent.com/ylw1997/touchFish/refs/heads/main/reaplace-ffmpeg.py | python - --check
  ```

  Linux / macOS：

  ```bash
  curl https://raw.githubusercontent.com/ylw1997/touchFish/refs/heads/main/reaplace-ffmpeg.py | python3 - --check
  ```

  检查结果中的 `Installed SHA-256` 和 `Expected SHA-256` 不一致，表示当前媒体库不是与 Electron 匹配的版本。

  **执行替换**

  Windows PowerShell：

  ```powershell
  Invoke-RestMethod https://raw.githubusercontent.com/ylw1997/touchFish/refs/heads/main/reaplace-ffmpeg.py | python
  ```

  Linux / macOS：

  ```bash
  curl https://raw.githubusercontent.com/ylw1997/touchFish/refs/heads/main/reaplace-ffmpeg.py | python3
  ```

  脚本会自动读取编辑器和 Electron 版本、下载对应架构的官方 Electron 构建、备份原媒体库、替换并比较 SHA-256；macOS 会在替换后重新签名并验证应用。看到 `Replacement and hash verification succeeded.` 才表示替换完成。备份保存在用户目录下的 `.touchfish/ffmpeg-backups`。

  **替换后仍然没有声音**
  1. 确认脚本打印的 `Installation` 就是当前打开的编辑器。终端中的 `code` 命令可能指向 Cursor 或其他编辑器，不能据此判断。
  2. 完全退出并重新启动编辑器，仅执行“重新加载窗口”不够。
  3. 再运行一次 `--check`；如果两个哈希不同，说明替换没有成功或已失效。
  4. **编辑器升级会重新写入自带的 FFmpeg**。如果声音在升级后再次消失，请针对新 Electron 版本重新运行脚本。
  5. 非标准安装路径可在运行脚本时指定。例如 macOS：

     ```bash
     curl https://raw.githubusercontent.com/ylw1997/touchFish/refs/heads/main/reaplace-ffmpeg.py | VSCODE_INSTALLATION="/Applications/Visual Studio Code.app" python3
     ```

  如果替换或签名失败，脚本会自动恢复备份。无法启动编辑器时，建议重新安装官方版本以恢复原始签名，然后再重新执行上述步骤。

- **问题反馈**: 如果遇到任何 Bug 或有功能建议，欢迎在 [GitHub Issues](https://github.com/ylw1997/touchFish/issues) 中提出。

## 友链

- [https://linux.do/](https://linux.do/u/ylw/summary)
