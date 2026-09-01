# DeepSeek Harness 桌面端

[English](README.md) | 中文

这个 Electron 壳把现有本地 Web UI 转换成可安装的 Windows 应用。它会复用 `127.0.0.1:3080` 上健康的 Harness 服务；否则启动安装包内置的 `dsh web` 后端，等待组装后的 UI 标记出现，再在隔离的桌面窗口中打开应用。

在开发或自动冒烟测试期间，可设置 `DSH_DESKTOP_PORT` 使用另一个回环端口。

桌面应用把 profile、会话和设置保存在应用持有的 `harness-home` 目录中。当桌面应用需要与现有 CLI home 共用数据时，请在启动前设置 `DSH_HOME`。

## 窗口外观

Windows 桌面壳使用与 Harness 客户端匹配的深色原生标题栏。当 Electron preload 存在时，「通用设置」会提供 60%–100% 的整窗透明度控制。所选透明度以 `window-appearance.json` 保存在 Electron 用户数据目录中，对原生窗口栏与 Web Client 内容同时生效，并会在原地更新应用后继续保留。普通浏览器会话不会获得这项仅供桌面端使用的控制。

## 更新通道

打包时设置 `DSH_DESKTOP_UPDATE_URL` 可嵌入通用 HTTPS 发布通道。构建会为该通道输出 Electron 更新元数据；需要把 `latest.yml`、NSIS 安装包及其 blockmap 一起发布到所配置的 URL。桌面设置面板随后会在启动后检查更新，并支持由用户明确触发的检查、下载、校验后暂存，以及安装并重启操作。未设置该变量的构建仍允许手动检查，并在不发起更新网络请求的情况下提示当前没有可下载更新。

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

构建会先创建一份提升后的生产部署，使 Harness profile loader 能够发现每个内置插件。随后 NSIS 安装包会写入 `apps/desktop/dist/`。安装后的应用会创建开始菜单与桌面快捷方式。服务端输出以 `desktop-server.log` 保存到 Electron 的平台日志目录中。
