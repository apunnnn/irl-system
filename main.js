const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const { machineId } = require('node-machine-id');
const { autoUpdater } = require('electron-updater');
const { exec, spawn } = require('child_process');

let mainWindow;
let mediamtxProcess;
let ffmpegProcess;

// ==========================================
// 1. PENDETEKSI JALUR FILE (PATH) OTOMATIS
// ==========================================
const mediamtxPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'mediamtx.exe') 
    : path.join(__dirname, 'mediamtx.exe');

const ffmpegPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'ffmpeg.exe') 
    : path.join(__dirname, 'ffmpeg.exe');

// ==========================================
// 2. FUNGSI MEMBUAT JENDELA APLIKASI
// ==========================================
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
    
    // Blokir F12 / Inspect Element
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            event.preventDefault();
        }
    });
}

// ==========================================
// 3. SIKLUS HIDUP APP (TIDAK ADA AUTO-START MESIN)
// ==========================================
app.whenReady().then(() => {
    createWindow();
    // MEDIA MTX TIDAK DINYALAKAN DI SINI LAGI
    autoUpdater.checkForUpdatesAndNotify(); 
});

autoUpdater.on('update-available', () => {
    dialog.showMessageBox({ type: 'info', title: 'Update Tersedia', message: 'Mengunduh update...' });
});
autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'question', buttons: ['Restart Sekarang', 'Nanti Saja'], defaultId: 0,
        title: 'Update Siap', message: 'Restart aplikasi untuk memasang versi terbaru?'
    }).then((res) => { if (res.response === 0) autoUpdater.quitAndInstall(); });
});

// ==========================================
// 4. PEMBERSIH OTOMATIS SAAT APP DITUTUP
// ==========================================
app.on('window-all-closed', () => {
    exec(`taskkill /IM mediamtx.exe /F`);
    exec(`taskkill /IM ffmpeg.exe /F`);
    if (process.platform !== 'darwin') app.quit();
});

// ==========================================
// 5. VERIFIKASI LISENSI VERCEL
// ==========================================
ipcMain.handle('verify-license', async (event, data) => {
    try {
        let hwid = await machineId().catch(() => "HWID-KOSONG");
        const VERCEL_URL = 'https://irl-license-server.vercel.app/api/verify';
        const response = await axios.post(VERCEL_URL, {
            license_key: data.licenseKey, hardware_id: hwid, tiktok_username: data.tiktokUser
        });
        return { success: true, message: response.data.message };
    } catch (error) {
        return { success: false, message: error.response?.data?.message || 'Gagal konek ke Server.' };
    }
});

// ==========================================
// 6. KONTROL MANUAL ENGINE & TRANSCODE
// ==========================================
ipcMain.on('start-core-engine', (event) => {
    // 1. Bersihkan port yang mungkin nyangkut
    exec(`taskkill /IM mediamtx.exe /F`, () => {
        // 2. Jalankan MediaMTX secara manual
        console.log("Menjalankan Core Engine (MediaMTX)...");
        mediamtxProcess = exec(`"${mediamtxPath}"`, (err) => {
            if (err) console.error("Gagal MediaMTX:", err);
        });
        event.reply('core-status', true);
    });
});

ipcMain.on('stop-core-engine', (event) => {
    console.log("Mematikan Semua Engine...");
    
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
        ffmpegProcess = null;
    }
    
    // Matikan paksa MediaMTX
    exec(`taskkill /IM mediamtx.exe /F`);
    exec(`taskkill /IM ffmpeg.exe /F`); // Sapu bersih sisa ffmpeg
    mediamtxProcess = null;
    
    event.reply('core-status', false);
});

ipcMain.on('start-preview', (event) => {
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
    }
    console.log("Transcoding HEVC ke H.264 untuk Preview...");
    
    const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-i', 'rtsp://127.0.0.1:8554/irl',  
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-s', '854x480',
        '-b:v', '500k',
        '-c:a', 'copy',
        '-f', 'rtsp',
        '-rtsp_transport', 'tcp',
        'rtsp://127.0.0.1:8554/preview'
    ];
    ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
});

ipcMain.on('stop-preview', (event) => {
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
        ffmpegProcess = null;
    }
});