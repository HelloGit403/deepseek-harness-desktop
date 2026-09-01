# DeepSeek Harness Desktop

English | [中文](README.zh.md)

This Electron shell turns the existing local Web UI into an installable Windows application. It reuses a healthy Harness server on `127.0.0.1:3080`; otherwise it starts the packaged `dsh web` backend, waits for the assembled UI marker, and then opens the application in an isolated desktop window.

Set `DSH_DESKTOP_PORT` to use a different loopback port during development or automated smoke tests.

The desktop app keeps its profiles, sessions, and settings in an app-owned `harness-home` directory. Set `DSH_HOME` before launching the app when it should share an existing CLI home instead.

## Window appearance

The Windows desktop shell uses a dark native title bar to match the Harness client. General settings exposes a 60%–100% whole-window opacity control when the Electron preload is present. The selected opacity is stored in Electron's user-data directory as `window-appearance.json`, applies to native window chrome and Web Client content, and survives in-place application updates. Ordinary browser sessions do not receive this desktop-only control.

## Update channel

Set `DSH_DESKTOP_UPDATE_URL` while packaging to embed a generic HTTPS release channel. The build emits Electron update metadata for that channel; publish `latest.yml`, the NSIS installer, and its blockmap together at the configured URL. The desktop Settings panel then checks after startup and supports explicit check, download, verified staging, and install-and-restart actions. A build without the variable keeps manual checks available and reports that no update can be downloaded without making an update network request.

The updater replaces installed application files only. Profiles, sessions, settings, credentials, logs, and cached update state live under Electron's user-data directories rather than the installation directory, so a normal in-place update preserves them.

## Development

From the repository root:

```sh
pnpm install
pnpm run desktop:test
pnpm run desktop:dev
```

## Windows installer

```sh
pnpm run desktop:dist
```

The build first creates a hoisted production deployment so Harness's profile
loader can discover every built-in plugin. The NSIS installer is then written
to `apps/desktop/dist/`. The installed application creates Start menu and
desktop shortcuts. Server output is stored in Electron's platform log directory
as `desktop-server.log`.
