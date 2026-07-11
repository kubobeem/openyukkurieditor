import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Open Yukkuri Editor',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  const menu = Menu.buildFromTemplate([
    {
      label: 'ファイル',
      submenu: [
        {
          label: 'プロジェクトを開く...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              filters: [{ name: 'YMM4 プロジェクト', extensions: ['ymmp'] }],
              properties: ['openFile'],
            })
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('open-project', result.filePaths[0])
            }
          },
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('save-project')
          },
        },
        {
          label: '名前を付けて保存...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow!, {
              filters: [{ name: 'YMM4 プロジェクト', extensions: ['ymmp'] }],
            })
            if (!result.canceled && result.filePath) {
              mainWindow?.webContents.send('save-project-as', result.filePath)
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo', label: '元に戻す' },
        { role: 'redo', label: 'やり直す' },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { role: 'delete', label: '削除' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: 'リロード' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { role: 'resetZoom', label: 'リセット' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.handle('show-save-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'YMM4 プロジェクト', extensions: ['ymmp'] }],
  })
  return result
})

ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (e) {
    console.error('Failed to read file:', e)
    return null
  }
})

ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (e) {
    console.error('Failed to write file:', e)
    return false
  }
})
