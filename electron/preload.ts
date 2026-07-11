import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenProject: (callback: (filePath: string) => void) => {
    ipcRenderer.on('open-project', (_event, filePath) => callback(filePath))
  },
  onSaveProject: (callback: () => void) => {
    ipcRenderer.on('save-project', () => callback())
  },
  onSaveProjectAs: (callback: (filePath: string) => void) => {
    ipcRenderer.on('save-project-as', (_event, filePath) => callback(filePath))
  },
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
})
