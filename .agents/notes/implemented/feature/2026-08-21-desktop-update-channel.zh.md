# Agent Note: 桌面发布通道与应用内更新器

Status: implemented

[English](2026-08-21-desktop-update-channel.md) | 中文

## Problem

桌面安装包内置 Harness 服务端和 Web Client，因此上游源码发布不能安全地直接替换已安装应用。桌面适配与 Web Client 定制必须一起重新构建和测试，同时会话数据必须在应用程序文件被替换后继续保留。

## Decision

Electron 主进程通过 `electron-updater` 持有桌面更新，并通过与 sandboxed renderer 兼容、context-isolated 的 CommonJS preload，只暴露四项无参数操作和一个可观察状态快照。Web Client 仅在该 preload API 存在时注册桌面专属的「软件更新」分区；普通浏览器不会获得该分区。每次手动检查都会以结果弹窗结束，分别反馈发现新版、已是最新、通道尚未发布或检查失败。

正式发布构建会在暂存应用中记录公开的 `HelloGit403/deepseek-harness-desktop` GitHub Releases 提供方。`DSH_DESKTOP_UPDATE_URL` 仍是明确的打包时覆盖项，供持有其他通用 HTTPS 发布地址的部署方使用。已配置的构建会在启动后检查更新，所有下载与安装操作仍须由用户明确触发。Electron Builder 的发布元数据提供安装包校验值，更新器只有在校验完成后才发布已下载状态。开发构建和未打包构建保持可用，并显示未配置状态，而不会猜测更新来源。

仓库中的 Windows 发布工作流会把 `.github/desktop-upstream.json` 记录的精确 DeepSeek Harness 官方版本检出到隔离的源码目录，再把本仓库持有的桌面外壳与桌面专属设置集成复制到这份版本一致的官方源码上。工作流安装组装后的工作区，构建正式 Host 与 Web 产物，再把 NSIS 安装包、对应的 blockmap 和 `latest.yml` 作为一个 GitHub Release 发布。由于 `electron-updater` 要求发布订阅中的标签能够解析为 SemVer，工作流会从桌面包版本推导 `v<版本号>` 标签，并拒绝不匹配的已推送标签、仓库构建失败或不完整的发布文件集合。

当选定的 DeepSeek Harness 官方版本只提供替代它的 `ptc` 时，桌面暂存步骤会保持持久化的 `code` 预设标识可被挂载。它把当前官方 `ptc` 目录复制到暂存的 `code` 目录，不修改源码树或会话日志。当选定的官方版本提供 `code` 时，暂存步骤不会覆盖该目录，因此官方组合始终优先。

Electron 用户数据目录持有 Harness home 和更新缓存。NSIS 只替换安装目录，因此 profile、会话、归档会话成员关系、设置和凭据都位于被替换文件之外。

## Alternatives considered

**直接安装 DeepSeek Harness 源码发布。** 上游发布资产描述 Harness 源码，并不包含这份适配后的桌面安装包；安装这些资产无法保留桌面外壳与定制 Web Client。

**在桌面窗口中加载最新公共网站。** 远程内容会使可见客户端与内置本地服务端的版本分离，也会让一次网站部署成为未经审查的桌面更新。

**维护自制安装包下载器。** Electron Updater 已经协调 NSIS 元数据、校验值验证、下载缓存、进度和重启安装；另一套实现会重复涉及安全与生命周期的行为。

**在安装时重写已保存的会话日志。** 会话日志是持久化的模型与工具历史，安装器既不持有会话后端的事务所有权，也没有安全重写预设标识所需的上下文。暂存别名保留已记录的字节，并把适配限定在可替换的应用程序文件中。

## Consequences

每个可安装更新都必须在桌面适配通过检查后，把 `latest.yml`、NSIS 安装包及其 blockmap 放在同一个 Release 中发布。应用能够发现并安装这些版本，而无需移动用户数据。需要暂存别名的构建会在预设名单中显示一个兼容 PTC 条目；新会话继续使用当前 `ptc` ID。公开通道依赖仓库 Release 可用；开发构建和未打包构建不会发起更新网络请求。
