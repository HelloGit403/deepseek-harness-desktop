# DeepSeek Harness Desktop

This Electron shell turns the existing local Web UI into an installable Windows application. It reuses a healthy Harness server on `127.0.0.1:3080`; otherwise it starts the packaged `dsh web` backend, waits for the assembled UI marker, and then opens the application in an isolated desktop window.

Set `DSH_DESKTOP_PORT` to use a different loopback port during development or automated smoke tests.

The desktop app keeps its profiles, sessions, and settings in an app-owned `harness-home` directory. Set `DSH_HOME` before launching the app when it should share an existing CLI home instead.

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
