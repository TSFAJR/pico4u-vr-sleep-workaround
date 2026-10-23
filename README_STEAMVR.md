# 独立 SteamVR 软件亮度控制

在主页卡片使用“SteamVR 软件亮度控制”，滑块两侧的 − / + 按钮每次微调 1%，范围为 0–100%。设置页管理睡眠模式的独立预设，见 [睡眠模式说明](README_SLEEP.md)。首次启动及重新打开工具时，控制始终关闭；主页滑块恢复上次保存的手动数值。

- 启动 Virtual Desktop、SteamVR 和 VRChat 后启用控制。滑块范围为 0–100%，100% 隐藏遮罩，0% 尽可能遮黑普通 VR 内容。
- 主页控件即时生效并独立保存，不受设置页“应用／取消”影响。控制关闭时滑块只保存手动亮度，不会修改睡眠亮度预设。
- 旧定时调暗已由手动／自动睡眠模式替代。睡眠临时亮度不覆盖手动保存值，退出睡眠恢复快照。
- **恢复 100% 并关闭控制**是桌面恢复入口，始终可点击。禁用开关也会取消遮挡，但保留数值。
- 本次会话保持启用时，SteamVR 退出／重启后会自动重新连接并恢复亮度；关闭本工具会释放遮罩。
- 此独立软件滑块不调整 PICO 物理背光；睡眠模式另行通过 ADB 调整物理亮度，不修改音频、游戏或追踪设置。不要同时启用 OyasumiVR 的调光。
- SteamVR 特权系统界面不一定被遮盖；LCD 背光和黑位不由软件遮罩控制。双眼覆盖、边缘漏光和真实视感必须通过头显确认。

## 架构和恢复

Tauri 通过有序 JSON 行协议管理 `steamvr-brightness-helper.exe`。OpenVR 只在辅助进程内加载，使用 Background 模式，不能主动启动 SteamVR。每个会话最多一个固定键的 HMD 跟随遮罩，不接收输入。

辅助程序根据双眼投影和眼睛到 HMD 的变换计算尺寸：前方 0.15 米、正方形至少 1 米，并为双眼边缘预留 10%。宽度每秒检查一次，透明度采用 `1 - (percent / 100)^(1 / 0.55)`。

普通失败会显示本地化原因和 OpenVR 数字错误码；Overlay 创建失败不会后台无限重建，需要点击重试。SteamVR 正常退出后每两秒尝试重连。

关闭会执行 Hide → Destroy → Shutdown；仅禁用亮度时，若监测仍在运行则保留 OpenVR 会话；一秒内未确认恢复时，主程序终止自己创建的辅助进程。Windows Job 的关闭即终止机制也覆盖主程序意外退出。辅助进程重复异常退出后暂停自动重启，需手动重试。不终止 SteamVR、VRChat、VD 或共享 ADB 进程。

## 构建

沿用 [CONTRIBUTING.md](CONTRIBUTING.md) 的 Windows x64 Rust/MSVC、Node 24、pnpm 环境。无需 CMake、LLVM、MQTT、Root 或 OyasumiVR。

```powershell
# 直接运行 Rust 检查前先准备 DLL 和带目标后缀的 sidecar
node scripts/steamvr.mjs
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --locked -- -D warnings

# pnpm dev / build 的现有 hook 会自动准备对应 debug / release sidecar
.\scripts\pnpm.ps1 build --no-sign
```

只预览 React 时使用 `pnpm -C frontend dev`；SteamVR 控制需要 Tauri 进程。

绑定固定为 `raphii-openvr-rs` 提交 `e47f01430cda459653549d7dd35699463871a94a`。DLL 来自 Valve OpenVR SDK 提交 `0924064316de3effbcd1acf1e309182a2deb1c05` 的 `bin/win64/openvr_api.dll`，SHA256：

```text
bab8ac6ef64e68a9ca53315b0014d131088584b2efdfa6db511d67ec03cfcb4a
```

构建脚本首次下载并校验 DLL，此后检测已存在文件的哈希；不从用户的 SteamVR 安装目录复制不确定版本。NSIS/MSI 分发辅助程序、DLL 和 `LICENSES` 内的相关许可证。DLL 或 SteamVR 不可用时显示错误，主程序和 ADB 仍可运行。

## 实测清单

Windows 11 + PICO 4 Ultra + VD + SteamVR + VRChat：检查 100%、50%、10%、0% 下双眼全部视野、头显转动和 IPD 改变；恢复按钮和关闭程序；SteamVR 重启自动恢复；保存值后重开工具不自动启用；持续在线、追踪、声音和无线 ADB 防休眠。

自动测试、无运行环境测试和桌面截图不能代替这些头显验收项目。
