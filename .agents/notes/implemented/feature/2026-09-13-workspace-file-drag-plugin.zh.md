# Agent Note：工作区文件拖动采用客户端插件

状态：已实现

[English](2026-09-13-workspace-file-drag-plugin.md) | 中文

## 问题

桌面发布版需要允许用户把工作区树中的文件拖入对话 composer。最初的实现会在发布时修改官方文件树、附件与 composer 包。即使该行为使用的是客户端插件系统已经公开的概念，只要官方修改这些补丁附近的代码，就可能产生补丁冲突。

替代实现必须保留 Session 隔离、结构化文件引用序列化、用户编辑器选区、本地化和干净的热卸载行为，同时不能依赖私有 composer 实现。

## 决策

把该行为封装为私有 Web 客户端插件 `@deepseek-ai/dsh-client-ui-workspace-file-drag`。浏览器端向官方 `conversation.input.overlay` Slot 贡献一个 Session 范围的条目。其注入通过 `ctx.sessions.scope(sessionId)` 解析当前 Session，并且只使用公开的 `ctx.conversation.input.for(actx)` facade 读取当前 revision、插入结构化引用。

文件树没有公开拖动源 Slot，因此插件发现它公开的 `data-files-state`、`data-files-root`、`data-files-entry` 与 `data-files-path` 属性。`MutationObserver` 会把当前和随后出现的文件按钮标为可拖动。传输使用 `application/vnd.deepseek-harness.workspace-file`，包含来源 Session id 与工作区相对路径。接收端只接受当前 Session、可编辑 composer、根目录后代的相对路径，以及 `formatFileMention` 可以表示的路径。

插件记录 `data-composer-input` 内最后一个浏览器选区。DOM 文本按 UTF-16 长度计数，引用 chip 与换行各计一个 detect 单位，顶层块之间计一个换行。拖放使用该 span 与当前 `draftRev`；若选区没有保留，则根据公开的草稿和 occurrence projection 推导 detect 坐标下的草稿末尾。

桌面发布流程把这个包复制到固定版本的官方工作区，把它加入 Web bundle 依赖和客户端 TypeScript 聚合，并向 Web patch 追加一个 Loader row。该功能不再应用源码补丁。因此，官方对无关源码位置的修改不会产生 hunk 冲突。若公开服务、Slot、包依赖或必需的 DOM 属性被移除，构建或聚焦集成测试仍会在发布前失败。

## 考虑过的替代方案

**保留发布时源码补丁。**拒绝，因为该功能会与多个组件文件的任意上游编辑冲突，还必须跟踪其私有 prop 和方法。

**把文件复制为附件。**拒绝，因为来源已经属于 Session 工作区；上传副本会隐藏后续工作区编辑，并绕过标准文件引用序列化器。

**使用纯文本拖动数据。**拒绝，因为无关的浏览器和操作系统拖动经常提供它。产品专属 MIME 类型可以明确标识内部手势。

**通过 DOM 编辑 API 插入。**拒绝，因为这会绕过输入状态机的 revision guard、引用身份、剪贴板 projection 与序列化器。

## 验证

包测试覆盖 POSIX 与 Windows 后代检查、安全 mention 转换、DOM 选区 projection、感知 chip 的后备长度、传输生成、当前 Session 拖放插入、格式错误与外来 payload 拒绝、本地化 overlay 可见性、动态挂载行，以及监听器和 observer 的完整清理。桌面发布脚本测试验证包复制与向官方 Web 配置进行幂等注册。

## 后果

- 官方源码更新不再要求文件树拖动补丁在相同行位置应用成功。
- 插入的 chip 与模型可见路径继续与现有 `@` 引用流程完全相同。
- 插件可以卸载，不会保留文档监听器或继续观察后续 DOM 变化。
- 剩余兼容依赖是明确的：公开 Conversation/Slot 接口加用于测试的 DOM 属性。假设失效时，发布验证会停止发布。
