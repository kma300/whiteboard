// Desktop shell for the Whiteboard web app. The page runs sandboxed with no Node access;
// this process only opens the window, owns the app menu, and blocks navigation away.
const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('node:path')

const DEV_URL = process.env.WHITEBOARD_DEV_URL
const isMac = process.platform === 'darwin'

/**
 * Sends a menu command to the page, which routes it to the canvas or to native text editing.
 * Uses the window the menu reports, then the focused window, then the app's only window.
 */
function sendCommand(win, command) {
  const target =
    (win instanceof BrowserWindow ? win : null) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows()[0]
  if (!target) return
  const script = `window.dispatchEvent(new CustomEvent('wb-command', { detail: ${JSON.stringify(command)} }))`
  target.webContents.executeJavaScript(script).catch(() => {})
}

/**
 * The default menu binds Cmd+Z and Cmd+0/+/- to native page actions before the page sees them,
 * so those items forward to the app instead. Cut, Copy, and Paste stay native: they fire the DOM
 * clipboard events the canvas already handles, and they keep text fields working.
 */
function buildMenu() {
  const forward = (command) => (_item, win) => sendCommand(win, command)
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: forward('undo') },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: forward('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: forward('selectAll') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: forward('zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: forward('zoomOut') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: forward('zoomReset') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    title: 'Whiteboard',
    backgroundColor: '#F5F5F3',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })
  win.once('ready-to-show', () => win.show())

  // Links open in the default browser; the app window itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  if (DEV_URL) {
    win.loadURL(`${DEV_URL}?shell=electron`).catch(() => {})
  } else {
    win
      .loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { shell: 'electron' } })
      .catch(() => {})
  }
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
