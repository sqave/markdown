const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    webPreferences: { offscreen: true },
  });

  const svgContent = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf-8');
  const html = `<html><body style="margin:0;padding:0;overflow:hidden">${svgContent}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  // Wait for render
  await new Promise(r => setTimeout(r, 500));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  fs.writeFileSync(path.join(__dirname, 'build', 'icon.png'), image.toPNG());
  console.log('icon.png generated');
  app.quit();
});
