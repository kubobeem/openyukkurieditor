import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenProject: (callback: (filePath: string) => void) => {
    const listener = (_event: unknown, filePath: string) => callback(filePath)
    ipcRenderer.on('open-project', listener)
    return () => ipcRenderer.off('open-project', listener)
  },
  onSaveProject: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('save-project', listener)
    return () => ipcRenderer.off('save-project', listener)
  },
  onSaveProjectAs: (callback: (filePath: string) => void) => {
    const listener = (_event: unknown, filePath: string) => callback(filePath)
    ipcRenderer.on('save-project-as', listener)
    return () => ipcRenderer.off('save-project-as', listener)
  },
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
})
