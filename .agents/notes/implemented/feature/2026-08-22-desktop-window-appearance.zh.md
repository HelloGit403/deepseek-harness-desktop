# Agent Note: 桌面端持有标题栏与窗口透明度

Status: implemented

[English](2026-08-22-desktop-window-appearance.md) | 中文

## Problem

当 Harness 客户端使用深色主题时，Windows 原生标题栏仍可能跟随操作系统的浅色配色，因而在应用上方形成一条亮色区域。浏览器 CSS 也无法调整原生窗口栏的透明度，而只存于 renderer 的偏好无法可靠地在已安装应用被替换后继续保留。

## Decision

Electron 主进程在创建窗口前选择深色原生主题，因此 Windows 继续持有标准标题栏按钮，同时标题栏与桌面客户端的深色外壳保持一致。应用保留原生标题栏，不自行实现拖动区、缩放区和标题栏按钮。

主进程同时持有整个窗口的透明度。context-isolated preload 只在 `deepSeekDesktopWindow` 下暴露 `getOpacity()` 和 `setOpacity(value)`；IPC 处理器只接受 Harness 主窗口发出的调用。值必须是有限数字，保留两位小数，并限制在 `0.6` 到 `1` 之间，使窗口始终足够清晰以恢复其控件。

所选值保存在 Electron 用户数据目录的 `window-appearance.json` 中，并在每次创建 BrowserWindow 时应用。Web Client 仅在完整 preload API 存在时，才在「通用设置」注册「窗口透明度」行，因此普通浏览器既不显示该控件，也无法访问桌面 IPC 表面。

## Alternatives considered

**对 Web Client 根节点应用 CSS opacity。** CSS 只能淡化浏览器内容，无法改变原生标题栏，而且页面会与自身不透明的窗口背景合成，而不是与应用背后的桌面合成。

**用透明无边框窗口替代原生标题栏。** 自定义边框需要自行持有拖动区、缩放行为、标题栏按钮、键盘访问、最大化窗口几何与显示缩放测试。Windows 原生窗口栏已经提供这些行为，只需要与页面匹配的深色配色。

**把偏好存进 Harness 用户设置。** Harness Web Host 是 Electron 壳的子进程，并不持有 BrowserWindow 状态。把这项仅属于桌面壳的偏好保存在 Electron 用户数据中，既能在子服务和 renderer 启动前读取，也能在原地更新应用后继续保留。

## Consequences

安装后的 Windows 应用以深色原生标题栏打开，并提供对包括原生窗口栏在内的整个窗口生效、可持久保存的 60%–100% 透明度控制。降低透明度会有意降低文本对比度，但强制下限和一键恢复 100% 使用户始终能够恢复。读取偏好失败时窗口回退到完全不透明，无效 renderer 值会被拒绝，保存失败则会在设置行中明确显示。浏览器部署和 Agent 行为不变。
