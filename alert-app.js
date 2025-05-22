const { app, BrowserWindow, ipcMain } = require('electron');
const Player = require('play-sound')((opts = {}));
const fetch = require('node-fetch');
const path = require('path');

let mainWindow;
const lastSent = new Map(); // Theo dõi thời gian gửi cảnh báo cuối cùng

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('alert-index.html');
  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', () => {
  createWindow();
  checkAbnormalStatus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

async function checkAbnormalStatus() {
  try {
    const response = await fetch('http://127.0.0.1:3000/check-abnormal');
    const data = await response.json();

    const abnormalEntries = data.filter((item) => item.status === 1);
    if (abnormalEntries.length > 0) {
      const now = Date.now();
      for (const entry of abnormalEntries) {
        const key = `${entry.ip}-${entry.slaveId}`;
        const lastSentTime = lastSent.get(key) || 0;

        // Chỉ hiển thị cảnh báo nếu đã qua 10 phút (600,000 ms) kể từ lần cuối
        if (now - lastSentTime > 60000) {
          // Phát âm thanh
          Player.play(path.join(__dirname, '/static/audio/beep-01a.mp3'), (err) => {
            if (err) console.error('Lỗi phát âm thanh:', err);
          });

          // Hiển thị cửa sổ và gửi dữ liệu
          if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.webContents.send('update-alert', entry);
            mainWindow.show();
          } else if (!mainWindow) {
            createWindow();
            mainWindow.webContents.on('did-finish-load', () => {
              mainWindow.webContents.send('update-alert', entry);
            });
          }

          lastSent.set(key, now);
        }
      }
    }
  } catch (error) {
    console.error('Lỗi khi gọi API /check-abnormal:', error.message);
  }

  // Gọi lại sau 11 giây
  setTimeout(checkAbnormalStatus, 11000);
}

// Xử lý sự kiện từ cửa sổ
ipcMain.on('close-notification', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('open-html', () => {
  const { shell } = require('electron');
  shell.openExternal('http://127.0.0.1:3000/check-abnormal.html');
});
