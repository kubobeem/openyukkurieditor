// Electron API exposed via preload
interface ElectronAPI {
  onOpenProject: (callback: (filePath: string) => void) => void
  onSaveProject: (callback: () => void) => void
  onSaveProjectAs: (callback: (filePath: string) => void) => void
  showSaveDialog: () => Promise<{ canceled: boolean; filePath?: string }>
  readFile: (filePath: string) => Promise<string | null>
  writeFile: (filePath: string, content: string) => Promise<boolean>
}

interface Window {
  electronAPI?: ElectronAPI
}
