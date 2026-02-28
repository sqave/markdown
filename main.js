const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const iconPath = path.join(__dirname, 'build', 'icon.png');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 13 },
    backgroundColor: '#141414',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });
}

// --- File I/O IPC ---

ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});

ipcMain.handle('save-file', async (_event, { filePath, content }) => {
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('save-file-as', async (_event, { content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    defaultPath: 'untitled.md',
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

ipcMain.on('set-title', (_event, title) => {
  mainWindow.setTitle(title);
});

ipcMain.on('set-document-edited', (_event, edited) => {
  mainWindow.setDocumentEdited(edited);
});

// --- Menu ---

function sendMenuAction(action) {
  if (mainWindow) mainWindow.webContents.send('menu-action', action);
}

const menuTemplate = [
  {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'File',
    submenu: [
      {
        label: 'New',
        accelerator: 'CmdOrCtrl+N',
        click: () => sendMenuAction('new'),
      },
      {
        label: 'Open…',
        accelerator: 'CmdOrCtrl+O',
        click: () => sendMenuAction('open'),
      },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => sendMenuAction('save'),
      },
      {
        label: 'Save As…',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => sendMenuAction('saveAs'),
      },
      { type: 'separator' },
      {
        label: 'Close Tab',
        accelerator: 'CmdOrCtrl+W',
        click: () => sendMenuAction('closeTab'),
      },
      { type: 'separator' },
      {
        label: 'Next Tab',
        accelerator: 'CmdOrCtrl+Shift+]',
        click: () => sendMenuAction('nextTab'),
      },
      {
        label: 'Previous Tab',
        accelerator: 'CmdOrCtrl+Shift+[',
        click: () => sendMenuAction('prevTab'),
      },
      { type: 'separator' },
      {
        label: 'Check for Updates…',
        click: () => sendMenuAction('checkForUpdates'),
      },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
  {
    label: 'View',
    submenu: [
      {
        label: 'Editor Only',
        accelerator: 'CmdOrCtrl+1',
        click: () => sendMenuAction('viewEditor'),
      },
      {
        label: 'Split View',
        accelerator: 'CmdOrCtrl+2',
        click: () => sendMenuAction('viewSplit'),
      },
      {
        label: 'Preview Only',
        accelerator: 'CmdOrCtrl+3',
        click: () => sendMenuAction('viewPreview'),
      },
      { type: 'separator' },
      {
        label: 'Toggle Theme',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => sendMenuAction('toggleTheme'),
      },
      { type: 'separator' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      {
        label: 'Increase Font Size',
        accelerator: 'CmdOrCtrl+=',
        click: () => sendMenuAction('fontIncrease'),
      },
      {
        label: 'Decrease Font Size',
        accelerator: 'CmdOrCtrl+-',
        click: () => sendMenuAction('fontDecrease'),
      },
      {
        label: 'Reset Font Size',
        accelerator: 'CmdOrCtrl+0',
        click: () => sendMenuAction('fontReset'),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: 'Reset All Settings',
        click: () => sendMenuAction('resetSettings'),
      },
    ],
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
    ],
  },
];

// --- Auto-updater ---

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.on('update-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-available');
  });
  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-not-available');
  });
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update-downloaded');
  });
}

ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

// --- App lifecycle ---

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
  setupAutoUpdater();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle file open from OS (double-click .md file or drag to dock icon)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('file-opened', { filePath, content });
  }
});
