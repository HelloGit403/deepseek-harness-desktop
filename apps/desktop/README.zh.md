# DeepSeek Harness 桌面端

[English](README.md) | 中文

这个 Electron 壳把现有本地 Web UI 转换成可安装的 Windows 应用。它会复用 `127.0.0.1:3080` 上健康的 Harness 服务；否则启动安装包内置的 `dsh web` 后端，校验服务就绪后公布的本机鉴权 URL，再在隔离的桌面窗口中打开应用。

在开发或自动冒烟测试期间，可设置 `DSH_DESKTOP_PORT` 使用另一个回环端口。

桌面应用把 profile、会话和设置保存在应用持有的 `harness-home` 目录中。当桌面应用需要与现有 CLI home 共用数据时，请在启动前设置 `DSH_HOME`。

## 窗口外观

Windows 桌面壳使用与 Harness 客户端匹配的深色原生标题栏。当 Electron preload 存在时，「通用设置」会提供 60%–100% 的整窗透明度控制。所选透明度以 `window-appearance.json` 保存在 Electron 用户数据目录中，对原生窗口栏与 Web Client 内容同时生效，并会在原地更新应用后继续保留。普通浏览器会话不会获得这项仅供桌面端使用的控制。

## 更新通道

正式构建默认使用公开的 [`HelloGit403/deepseek-harness-desktop`](https://github.com/HelloGit403/deepseek-harness-desktop/releases) GitHub Releases 通道。「Desktop Release」工作流会检出 `.github/desktop-upstream.json` 记录的精确 DeepSeek Harness 官方版本，应用本仓库的桌面外壳与桌面专属设置集成，再一起发布 `latest.yml`、NSIS 安装包及其 blockmap。桌面设置面板会在启动后检查这个通道，并支持由用户明确触发的检查、下载、校验后暂存，以及安装并重启操作。

「Desktop Upstream Sync」工作流每六小时检查一次配置的官方分支。分支头发生变化时，工作流会记录新提交、递增桌面候选版本，并派发「Desktop Release」。如果对应发布因失败或中断而缺失，下一次同步会在不再次递增版本的情况下重新派发。只有完整官方构建、桌面测试、安装器构建与封装后启动冒烟测试全部通过，版本才会出现在应用更新通道中。

只有部署方需要用另一个通用 HTTPS 发布地址替换内置 GitHub 通道时，才在打包时设置 `DSH_DESKTOP_UPDATE_URL`。开发构建或未打包构建仍允许手动检查，但不会访问发布通道。

更新器只替换已安装的应用程序文件。profile、会话、设置、凭据、日志与已缓存更新状态位于 Electron 用户数据目录中，而不是安装目录中，因此正常的原地更新会保留这些数据。

## 开发

在仓库根目录运行：

```sh
pnpm install
pnpm run desktop:test
pnpm run desktop:dev
```

## Windows 安装包

```sh
pnpm run desktop:dist
```

构建会从已打包的 `dsh` 应用解析完整的工作区依赖与必需 peer 图，创建一份提升后的生产部署，恢复 legacy deploy 遗漏的工作区包，并把包链接物化成文件。electron-builder 封装应用后，pack hook 会恢复其依赖遍历裁掉的 peer-only 包。随后构建会在操作系统分配的回环端口启动已打包可执行文件，并加载经过鉴权的完整 Web UI；缺少任何包或启动失败都会在接受 NSIS 安装包前终止发布。安装包写入 `apps/desktop/dist/`，安装后的应用会创建开始菜单与桌面快捷方式。服务端输出以 `desktop-server.log` 保存到 Electron 的平台日志目录中。

维护者需要更新固定的官方版本、验证桌面适配，再推送 `v<版本号>` 标签，或手动运行 **Desktop Release** 工作流来发布对应的 GitHub Release。该标签是 `electron-updater` 能够发现候选版本的有效 SemVer，且版本必须与 `apps/desktop/package.json` 一致；更新元数据不完整时，工作流会拒绝发布不完整的更新通道。
