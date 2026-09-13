---
description: "用于把工作区文件树条目拖入当前 composer 并生成结构化文件引用的桌面 Web 插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace-file-drag

[English](README.md) | 中文

## 概述

这个私有客户端插件允许用户把右侧边栏工作区树中的文件拖入当前 Session 的 composer。该操作插入与引用选择器相同的结构化 `@file` 引用；已经属于 Session 工作区的文件不会再次上传。桌面发布流程会把本包安装到固定版本的官方工作区，并通过官方 Web 插件清单注册。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

使 bundle 可以读取本包后，把 `@deepseek-ai/dsh-client-ui-workspace-file-drag` 注册为 Web 客户端 row。文件树挂载时，文件行会变成可拖动。把文件拖到可编辑 composer 上会替换保留的选区；若浏览器无法在拖动期间保留选区，则插到当前草稿末尾。

传输数据使用产品专属 MIME 值，包含当前 Session id 与工作区相对路径。接收端会拒绝其他 Session、树根之外的路径、绝对路径、格式错误的数据，以及标准文件引用语法无法表示的路径。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件向 `conversation.input.overlay` 贡献 `workspace-file-drag`。它的 Session 注入通过公开的 `ctx.conversation.input` facade 解析输入；包边界不会穿过私有 composer 类或组件回调。Session 范围的 React 条目安装文档监听器与 `MutationObserver`，把当前和随后出现的文件行按钮标为可拖动，把 DOM 选区位置转换为 composer 的 detect 坐标，并在卸载时清理所有监听器和 observer。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 注册 locale、解析 Session 输入并贡献 overlay |
| [`src/client/WorkspaceFileDragBridge.tsx`](src/client/WorkspaceFileDragBridge.tsx) | 发现文件行、校验传输、投影选区、插入引用并显示 overlay |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文拖动文案 |
| [`src/index.ts`](src/index.ts) | 空的 Host apply，使 Loader 可以寻址该浏览器插件 |
| [`src/invariant.ts`](src/invariant.ts) | 不变式伴生插件；生命周期行为由包测试验证 |

[工作区文件拖动插件 Agent Note](../../../.agents/notes/implemented/feature/2026-09-13-workspace-file-drag-plugin.zh.md)记录了使用官方插件接缝、而不再使用上游源码补丁的决定。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Conversation UI](../ui-conversation/README.zh.md)——持有公开的 Session 输入 facade 与 composer overlay slot。
- [文件引用](../../context/file-reference/README.zh.md)——持有安全的 `@file` mention 语法。
- [客户端包映射](../README.zh.md)——列出相邻的浏览器插件。
- [桌面外壳](../../../apps/desktop/README.zh.md)——说明发布时如何把插件安装到官方源码工作区。

-----

<a id="model-experience"></a>
## 模型体验

间接影响，通过现有的 `reference` source；该 source 负责序列化用户拖动操作所插入的标准文件引用 chip。

#### KV Cache 影响

插件不增加稳定 prompt 前缀。拖入的引用只会改变该条用户消息，与键入或通过菜单选择同一文件引用的效果相同。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **DOM 发现**——文件树包没有公开拖动源 slot，因此插件依赖官方 `data-files-*` 与 `data-composer-*` 属性。发布测试必须在推送安装包之前发现上游属性变化。
- **只支持文件**——目录仍只能单击；操作系统外部文件拖放继续由附件插件处理。
- **选区保留**——浏览器可能在拖动时清除 contenteditable 选区；安全后备位置是草稿末尾。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

集成应保持在公开 Slot 与 Session 输入接口上。若文件树以后公开拖动源 capability，只需在本包内替换 DOM 发现，不需要修改桌面发布安装器或 conversation 包。

</details>
