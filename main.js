const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const { machineId } = require('node-machine-id');
const { autoUpdater } = require('electron-updater');
const { exec, spawn } = require('child_process');
const os = require('os');

let mainWindow;
let mediamtxProcess = null;
let ffmpegProcesses = { 1: null, 2: null, 3: null, 4: null };

const workingDirectory = app.isPackaged ? process.resourcesPath : __dirname;
const mediamtxPath = path.join(workingDirectory, 'mediamtx.exe');
const ffmpegPath = path.join(workingDirectory, 'ffmpeg.exe');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440, height: 850, minWidth: 1100, minHeight: 700,
        title: "IRL SYSTEM V3 (QUAD CAM PRO) - Kamar Broadcast",
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: { nodeIntegration: true, contextIsolation: false, devTools: false }
    });

    mainWindow.removeMenu();
    mainWindow.loadFile('index.html');
    
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) event.preventDefault();
    });

    setInterval(() => {
        if (!mainWindow) return;
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const ramUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
        
        const cpus = os.cpus();
        let cpuUsage = 0;
        cpus.forEach(cpu => {
            let total = 0;
            for (let type in cpu.times) total += cpu.times[type];
            cpuUsage += (100 - (100 * cpu.times.idle / total));
        });
        cpuUsage = (cpuUsage / cpus.length).toFixed(1);

        mainWindow.webContents.send('sys-stats', { cpu: cpuUsage, ram: ramUsage });
    }, 2000);
}

app.whenReady().then(() => {
    createWindow();
    autoUpdater.checkForUpdatesAndNotify(); 
});

autoUpdater.on('update-available', () => {
    dialog.showMessageBox({ type: 'info', title: 'Update Tersedia', message: 'Versi terbaru terdeteksi! Mengunduh berkas update otomatis...' });
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'question', buttons: ['Restart dan Pasang', 'Nanti Saja'], defaultId: 0,
        title: 'Update Siap Pasang', message: 'Pembaruan sistem berhasil diunduh. Restart aplikasi sekarang untuk memasang versi terbaru?'
    }).then((res) => { if (res.response === 0) autoUpdater.quitAndInstall(); });
});

app.on('window-all-closed', () => {
    Object.keys(ffmpegProcesses).forEach(id => { if (ffmpegProcesses[id]) ffmpegProcesses[id].kill('SIGKILL'); });
    exec(`taskkill /IM mediamtx.exe /F`); exec(`taskkill /IM ffmpeg.exe /F`);
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('start-core-engine', (event) => {
    exec(`taskkill /IM mediamtx.exe /F`, () => {
        console.log("Membangun Jaringan Core Engine Server...");
        mediamtxProcess = exec(`"${mediamtxPath}"`, { cwd: workingDirectory }, (err) => {
            if (err) console.error("MediaMTX Crash / Berhenti:", err);
        });
        event.reply('core-status', true);
    });
});

ipcMain.on('stop-core-engine', (event) => {
    console.log("Mematikan Seluruh Jaringan Server Inti...");
    Object.keys(ffmpegProcesses).forEach(id => {
        if (ffmpegProcesses[id]) { ffmpegProcesses[id].kill('SIGKILL'); ffmpegProcesses[id] = null; }
    });
    exec(`taskkill /IM mediamtx.exe /F`); exec(`taskkill /IM ffmpeg.exe /F`);
    mediamtxProcess = null; event.reply('core-status', false);
});

// ==========================================================
// 6. MANAJEMEN PREVIEW (PRIORITAS RENDAH - KHUSUS PREVIEW 360P)
// ==========================================================
ipcMain.on('start-preview', (event, camId) => {
    if (ffmpegProcesses[camId]) ffmpegProcesses[camId].kill('SIGKILL');

    console.log(`Membuat Jalur Preview Ringan (360p) untuk Kamera ${camId}...`);
    
    // FFmpeg diringankan secara ekstrem agar CPU fokus untuk OBS!
    const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-i', `rtsp://127.0.0.1:8554/irl${camId}`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-s', '640x360',        // Resolusi Preview dikunci 360p
        '-r', '20',             // FPS Preview diturunkan ke 20
        '-b:v', '250k',         // Bitrate khusus Preview ditekan seminimal mungkin
        '-an',                  // Tanpa audio
        '-f', 'rtsp',
        '-rtsp_transport', 'tcp',
        `rtsp://127.0.0.1:8554/preview${camId}`
    ];

    ffmpegProcesses[camId] = spawn(ffmpegPath, ffmpegArgs, { cwd: workingDirectory });
});

ipcMain.on('stop-preview', (event) => {
    Object.keys(ffmpegProcesses).forEach(id => {
        if (ffmpegProcesses[id]) { ffmpegProcesses[id].kill('SIGKILL'); ffmpegProcesses[id] = null; }
    });
});

ipcMain.handle('verify-license', async (event, data) => {
    try {
        let hwid = await machineId().catch(() => "HWID-KOSONG");
        const VERCEL_URL = 'https://irl-license-server.vercel.app/api/verify';
        const response = await axios.post(VERCEL_URL, { license_key: data.licenseKey, hardware_id: hwid, tiktok_username: data.tiktokUser });
        return { success: true, message: response.data.message };
    } catch (error) { return { success: false, message: error.response?.data?.message || 'Gagal tersambung ke Server Lisensi.' }; }
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: "Pilih Folder Penyimpanan Rekaman (DVR)", properties: ['openDirectory', 'createDirectory'] });
    if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0]; 
    return null;
});