# Agent Note: 桌面打包保留完整 Web 运行时

Status: implemented

[English](2026-09-01-desktop-packaged-runtime-closure.md) | 中文

## Problem

桌面部署 manifest 只列出了 Electron 外壳的直接 import。Harness Web profile 还会按裸包名加载工作区插件，而这些插件会消费不属于普通传递依赖的必需 peer。pnpm legacy deploy 会遗漏若干工作区根，electron-builder 随后还会裁掉额外的 peer-only 包。工作流只验证安装器文件存在，从未启动已打包服务，因此表面成功的发布仍可能在第一次加载插件树时失败。

主进程还允许子进程退出处理器与启动超时路径同时导航同一个 BrowserWindow。Electron 会把失败一方的本地页面导航报告为 `ERR_ABORTED`，掩盖服务日志中记录的包解析错误。鉴权成为必需流程后，轮询未鉴权根地址还可能在服务已经公布就绪 URL 的情况下仍然超时。

## Decision

桌面构建计算以 `@deepseek-ai/dsh` 和外壳工作区依赖为根、与目标平台兼容的工作区依赖图。遍历覆盖 dependencies、optional dependencies 与非可选 peer dependencies。得到的包会成为显式的临时部署根；必需的外部 peer 保留其声明版本。即使 pnpm 失败，源 manifest 也会在部署后恢复。

构建会从已编译的工作区目录复制 legacy deploy 遗漏的包，把暂存包链接全部替换成目标文件，并在 electron-builder 开始前拒绝任何缺失的工作区包。after-pack hook 会比较暂存与已封装的顶层依赖树，恢复 electron-builder 作为 peer-only 裁掉的包，同时不覆盖已经封装的依赖目录。

每次 Windows 安装器构建都会用 `ELECTRON_RUN_AS_NODE`、隔离的临时 Harness home 和端口 `0` 启动未打包目录中的已封装可执行文件。检查会观察服务实际绑定的 URL，完成 token 到 cookie 的鉴权跳转，并要求完整 UI 标记出现。就绪过程只有一个明确期限，进程提前退出会立即失败，清理阶段会终止子进程并删除临时目录。发布工作流会调用这项构建，因此已打包应用启动失败会阻止发布。

Electron 启动路径会累积子进程 stdout，直到收到完整的 `dsh web` 公告；它只接受配置的本机 origin 上带鉴权参数的 URL，并加载该地址以便 Web 服务建立 cookie。公告会与子进程退出和单一超时竞争。只有这个协调路径渲染初始失败页面，超时还会终止桌面应用拥有的子进程，避免它在下一次启动时继续占用端口。Harness 页面完成加载后，后续子进程退出才可以渲染服务停止页面，因此两个启动导航不会竞争并遮蔽诊断信息。

## Alternatives considered

**每次失败后继续向桌面 manifest 增加缺失包。** 这会复制持续变化的 Web profile 图，并在下一次安装构建失败前继续遗漏新增的必需 peer。

**信任 electron-builder 的生产依赖遍历。** 它会按包管理器依赖元数据遍历，但 Harness 组合还把非可选 peer 与裸 profile 条目视为已安装运行时要求。已打包进程才是权威验证表面。

**只检查预期安装器文件是否存在。** 资产存在性能够验证更新通道完整性，却无法证明产物内部的模块解析与插件初始化。

## Consequences

桌面安装包会更大，构建也会更久，因为它携带并验证完整 Harness Web 运行时。发布不能再仅凭 NSIS 完成：已打包应用必须启动并提供经过鉴权的完整 UI。运行时 profile、Agent 行为、会话与设置均不改变；本决策只改变桌面组装、发布证据与启动错误协调。
