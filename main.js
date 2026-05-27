const { app, BrowserWindow, ipcMain, dialog } = require('electron'); // Tambah dialog
const path = require('path');
const axios = require('axios');
const { machineId } = require('node-machine-id');
const { autoUpdater } = require('electron-updater'); // 👈 TAMBAHAN BARU

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 1000,
        minHeight: 600,
        title: "IRL SYSTEM V1 - Kamar Broadcast",
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: false
        }
    });

    mainWindow.removeMenu();
    mainWindow.loadFile('index.html');
    
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            event.preventDefault();
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    
    // 👈 TAMBAHAN BARU: Cek update otomatis saat aplikasi dibuka
    autoUpdater.checkForUpdatesAndNotify();
});

// 👈 TAMBAHAN BARU: Sensor saat menemukan dan mengunduh update
autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Tersedia',
        message: 'Versi baru Kamar Broadcast IRL System telah tersedia. Sedang mengunduh di latar belakang...'
    });
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'question',
        buttons: ['Restart Sekarang', 'Nanti Saja'],
        defaultId: 0,
        title: 'Update Siap Dipasang',
        message: 'File update sudah selesai diunduh. Apakah Anda ingin merestart aplikasi sekarang untuk memasang versi terbaru?'
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ... (KODE IPCMAIN VERIFY-LICENSE DAN LAINNYA DI BAWAH SINI TETAP SAMA) ...
// ==========================================
// 1. SISTEM LISENSI & HWID (TERHUBUNG KE VERCEL)
// ==========================================
ipcMain.handle('verify-license', async (event, data) => {
    try {
        // Membaca Hardware ID (HWID) laptop klien
        let hwid = "TIDAK-TERBACA";
        try {
            hwid = await machineId();
            if (!hwid) hwid = "HWID-KOSONG";
        } catch (e) {
            console.error("Gagal membaca HWID");
        }

        // 👇 PASTIKAN INI URL VERCEL ASLIMU 👇
        const VERCEL_URL = 'https://irl-license-server.vercel.app/api/verify';
        
        // Format data yang dikirim disamakan dengan kemauan MongoDB/Vercel
        const payload = {
            license_key: data.licenseKey,
            hardware_id: hwid,
            tiktok_username: data.tiktokUser
        };

        const response = await axios.post(VERCEL_URL, payload);
        
        return { success: true, message: response.data.message };

    } catch (error) {
        return {
            success: false,
            message: error.response?.data?.message || 'Gagal terhubung ke Server Pusat (Vercel).'
        };
    }
});

// ==========================================
// 2. KONTROL CORE ENGINE & PREVIEW JARINGAN
// ==========================================
ipcMain.on('start-core-engine', (event) => {
    event.reply('core-status', true);
});

ipcMain.on('stop-core-engine', (event) => {
    event.reply('core-status', false);
});

ipcMain.on('start-preview', (event) => {
    // Logika preview
});

ipcMain.on('stop-preview', (event) => {
    // Logika stop preview
});