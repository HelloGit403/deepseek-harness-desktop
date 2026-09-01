const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deepSeekDesktopUpdate', Object.freeze({
  getState: () => ipcRenderer.invoke('desktop-update:get-state'),
  check: () => ipcRenderer.invoke('desktop-update:check'),
  download: () => ipcRenderer.invoke('desktop-update:download'),
  install: () => ipcRenderer.invoke('desktop-update:install'),
  onState: (listener) => {
    const receive = (_event, state) => { listener(state) }
    ipcRenderer.on('desktop-update:state', receive)
    return () => { ipcRenderer.removeListener('desktop-update:state', receive) }
  },
}))

contextBridge.exposeInMainWorld('deepSeekDesktopWindow', Object.freeze({
  getOpacity: () => ipcRenderer.invoke('desktop-window:get-opacity'),
  setOpacity: opacity => ipcRenderer.invoke('desktop-window:set-opacity', opacity),
}))
