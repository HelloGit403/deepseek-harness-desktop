# Agent Note: 桌面后端持有 TLS 信任默认值

Status: implemented

[English](2026-09-18-desktop-backend-tls-ca.md) | 中文

## Problem

Electron 主进程曾使用未经筛选的环境副本启动安装包内的 Harness 后端。因此，宿主级 Node.js 与 OpenSSL 设置可能选择不同的 CA 存储或关闭证书校验。宿主注入 `--use-openssl-ca` 时，有效的 DeepSeek HTTPS 请求可能因 `SELF_SIGNED_CERT_IN_CHAIN` 失败；如果不移除冲突参数就追加 `--use-bundled-ca`，Node.js 则会在进程启动前直接拒绝运行。

## Decision

桌面启动器会构造由内置 Harness 服务持有的环境。它移除所有大小写变体的 `NODE_OPTIONS`、`NODE_USE_SYSTEM_CA` 和 `NODE_TLS_REJECT_UNAUTHORIZED`，保留其他继承的 Node.js 参数，移除继承的 CA 选择参数，并写入一个规范的 `--use-bundled-ca` 参数。它还会写入一个规范的 `DSH_HOME` 值。

`NODE_EXTRA_CA_CERTS` 仍然可用并会被规范化，因此组织可以增加受管 CA 包，而无需替换 Node.js 内置根证书或关闭证书校验。其他环境变量仍可供 Harness 进程使用。

环境转换是纯函数，其测试覆盖 Windows 风格的不区分大小写键、冲突的 CA 参数、不安全的 TLS 绕过、附加 CA 包、输入不可变性，以及内置 CA 选择的幂等性。

## Alternatives considered

**关闭证书校验。** `NODE_TLS_REJECT_UNAUTHORIZED=0` 会同时掩盖本地流量拦截与真实证书故障，使 API 凭据和响应暴露给未经认证的端点。

**把内置 CA 参数追加到继承值。** 当 Node.js 同时收到 `--use-openssl-ca` 与 `--use-bundled-ca` 时会拒绝启动，因此启动器必须先移除冲突的 CA 选择参数，再加入它持有的默认值。

**丢弃完整的父进程环境。** Harness 后端仍需要普通进程设置与部署专用变量。启动器只移除由它持有的 TLS 信任选择项，并规范化两个需要确定性行为的值。

**默认使用操作系统 CA 存储。** 宿主信任存储会因机器而异，也是本次故障模式的来源。需要私有根证书的部署可以通过 `NODE_EXTRA_CA_CERTS` 显式添加，而不改变公共根证书默认值。

## Consequences

安装包内桌面版的 API 请求使用确定的公共根证书存储，并保持证书校验。机器级 Node.js 设置无法静默关闭校验，也无法把后端切换到 OpenSSL 根证书。拦截 HTTPS 的组织必须通过 `NODE_EXTRA_CA_CERTS` 提供其根证书；桌面启动器会保留这项显式配置。从 Harness 环境启动的子 Node.js 进程同样会继承内置 CA 默认值，除非其自身启动器将其替换。
