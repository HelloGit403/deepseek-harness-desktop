import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { desktopServerArgs, probeHarness, waitForHarness } from './harness-server.mjs'
import { DesktopUpdaterController, normalizeDesktopUpdateUrl } from './updater-controller.mjs'
import { createWindowAppearanceController } from './window-appearance.mjs'

const require = createRequire(import.meta.url)
const APP_PORT = process.env.DSH_DESKTOP_PORT ?? '3080'
if (!/^\d{1,5}$/.test(APP_PORT) || Number(APP_PORT) > 65_535) {
  throw new Error(`Invalid DSH_DESKTOP_PORT: ${APP_PORT}`)
}
const APP_URL = `http://127.0.0.1:${APP_PORT}/`
const APP_ORIGIN = new URL(APP_URL).origin

/** @type {BrowserWindow | undefined} */
let mainWindow
/** @type {import('node:child_process').ChildProcess | undefined} */
let serverProcess
let ownsServer = false
let quitting = false
let updateController
let automaticUpdateTimer
let windowAppearance

// Keep the Windows native title bar on Electron's dark system colors.
nativeTheme.themeSource = 'dark'

/** Render a small local page without enabling Node.js in the renderer. */
function localPage(title, message, detail = '') {
  const escape = value => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#f5f7fb;color:#172033;font:15px system-ui,sans-serif;display:grid;place-items:center;height:100vh}.card{width:min(520px,calc(100vw - 48px));background:#fff;border:1px solid #e3e7ef;border-radius:18px;padding:32px;box-shadow:0 18px 50px #1c2b4a18}h1{font-size:22px;margin:0 0 12px}p{line-height:1.6;margin:0;color:#566078}pre{white-space:pre-wrap;background:#f1f4f8;border-radius:10px;padding:12px;margin:18px 0 0;color:#7a3440}</style></head><body><main class="card"><h1>${escape(title)}</h1><p>${escape(message)}</p>${detail ? `<pre>${escape(detail)}</pre>` : ''}</main></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function createMainWindow() {
  const window = new BrowserWindow({
    title: 'DeepSeek Harness',
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#061424',
      symbolColor: '#d8f8ff',
      height: 36,
    },
    backgroundColor: '#050915',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(import.meta.dirname, 'preload.cjs'),
    },
  })
  windowAppearance = createWindowAppearanceController({
    window,
    preferencesPath: join(app.getPath('userData'), 'window-appearance.json'),
  })
  const cyberTheme = readFileSync(join(import.meta.dirname, 'cyber-theme.css'), 'utf8')
  window.webContents.on('did-finish-load', () => { void window.webContents.insertCSS(cyberTheme) })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === APP_ORIGIN || url.startsWith('data:')) return
    event.preventDefault()
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
  })
  window.on('closed', () => {
    mainWindow = undefined
    windowAppearance = undefined
  })
  return window
}

function createDesktopUpdater() {
  // A packaged desktop build enables updates when it has a feed to query. The
  // feed comes from two places: the electron-builder-authored app-update.yml
  // (bundled at pack time from `build.publish`, e.g. `generic`/`github`), or a
  // runtime `DSH_DESKTOP_UPDATE_URL` HTTPS override that takes precedence and
  // lets a deployment repoint updates without repacking. Both absent => the
  // release channel is deliberately unconfigured (the UI says so, never
  // pretends).
  const configPath = join(process.resourcesPath, 'app-update.yml')
  const runtimeUrl = normalizeDesktopUpdateUrl(process.env.DSH_DESKTOP_UPDATE_URL)
  const updater = app.isPackaged && (runtimeUrl !== undefined || existsSync(configPath))
    ? electronUpdater.autoUpdater
    : undefined
  if (updater !== undefined && runtimeUrl !== undefined) {
    // Override the baked feed with the runtime URL (HTTPS enforced by
    // normalizeDesktopUpdateUrl). electron-updater reads this as a generic
    // provider: it will fetch `<url>/latest.yml` next to the installer.
    updater.setFeedURL(runtimeUrl)
  }
  updateController = new DesktopUpdaterController({ currentVersion: app.getVersion(), updater })
  updateController.subscribe((state) => {
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop-update:state', state)
    }
  })

  const trusted = event => event.sender === mainWindow?.webContents
  ipcMain.handle('desktop-update:get-state', event => trusted(event) ? updateController.getSnapshot() : undefined)
  ipcMain.handle('desktop-update:check', event => trusted(event) ? updateController.check() : undefined)
  ipcMain.handle('desktop-update:download', event => trusted(event) ? updateController.download() : undefined)
  ipcMain.handle('desktop-update:install', event => trusted(event) ? updateController.install() : false)

  automaticUpdateTimer = setTimeout(() => { void updateController.check() }, 15_000)
}

function createDesktopWindowAppearance() {
  const trusted = event => event.sender === mainWindow?.webContents
  ipcMain.handle('desktop-window:get-opacity', event => trusted(event) ? windowAppearance?.getOpacity() : undefined)
  ipcMain.handle('desktop-window:set-opacity', (event, opacity) => trusted(event) ? windowAppearance?.setOpacity(opacity) : undefined)
}

function resolveDshEntry() {
  const packagePath = require.resolve('@deepseek-ai/dsh/package.json')
  return join(dirname(packagePath), 'lib', 'bin.js')
}

function startHarnessServer() {
  const logPath = join(app.getPath('logs'), 'desktop-server.log')
  const dshHome = process.env.DSH_HOME ?? join(app.getPath('userData'), 'harness-home')
  const log = createWriteStream(logPath, { flags: 'a' })
  serverProcess = spawn(process.execPath, desktopServerArgs(resolveDshEntry(), APP_PORT), {
    cwd: app.getPath('documents'),
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  ownsServer = true
  serverProcess.stdout?.pipe(log)
  serverProcess.stderr?.pipe(log)
  serverProcess.once('exit', (code) => {
    log.end()
    if (!quitting && mainWindow !== undefined && !mainWindow.isDestroyed()) {
      void mainWindow.loadURL(localPage(
        'DeepSeek Harness 已停止',
        '本地服务意外退出，请重新启动应用。',
        `退出代码：${String(code)}\n日志：${logPath}`,
      ))
    }
  })
  return logPath
}

async function openHarness() {
  mainWindow = createMainWindow()
  await mainWindow.loadURL(localPage('正在启动 DeepSeek Harness', '正在准备本地服务，首次启动可能需要稍等片刻。'))

  let logPath = ''
  if (!await probeHarness(APP_URL)) logPath = startHarnessServer()

  if (await waitForHarness(APP_URL)) {
    await mainWindow.loadURL(APP_URL)
    return
  }

  await mainWindow.loadURL(localPage(
    '无法启动 DeepSeek Harness',
    '本地服务未能在 60 秒内准备完成。请关闭应用后重试。',
    logPath ? `诊断日志：${logPath}` : `端口 ${APP_PORT} 已被其他程序占用。`,
  ))
}

function stopOwnedServer() {
  if (!ownsServer || serverProcess === undefined || serverProcess.killed) return
  serverProcess.kill()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(() => {
    createDesktopUpdater()
    createDesktopWindowAppearance()
    return openHarness()
  }).catch((error) => {
    mainWindow ??= createMainWindow()
    void mainWindow.loadURL(localPage('启动失败', '桌面应用无法完成初始化。', String(error)))
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void openHarness()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    quitting = true
    if (automaticUpdateTimer !== undefined) clearTimeout(automaticUpdateTimer)
    updateController?.dispose()
    stopOwnedServer()
  })
}
