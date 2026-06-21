import React, { useState, useEffect } from 'react';
import './ManifestModal.css';
import { 
  saveDirectoryHandle, 
  loadDirectoryHandle, 
  verifyPermission, 
  installManifestFile 
} from '../lib/manifestHelper';

export default function ManifestModal({ game, onClose }) {
  // Load Manifest API key from .env (Vite loads it using envPrefix configuration)
  const apiKey = import.meta.env.MANIFEST_API_KEY || '';
  
  const [dirHandle, setDirHandle] = useState(null);
  const [dirName, setDirName] = useState(localStorage.getItem('manifesthub_dirname') || '');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Load directory handle on mount
  useEffect(() => {
    loadDirectoryHandle().then((handle) => {
      if (handle) {
        setDirHandle(handle);
      }
    }).catch(err => console.error('Error loading dir handle', err));
  }, []);

  // Choose Steam directory
  const handleSelectFolder = async () => {
    try {
      if (!window.showDirectoryPicker) {
        alert('File System Access API is tidak didukung di browser ini. File akan langsung terunduh secara manual.');
        return;
      }
      setStatus('Membuka folder picker...');
      const handle = await window.showDirectoryPicker();
      setDirHandle(handle);
      setDirName(handle.name);
      localStorage.setItem('manifesthub_dirname', handle.name);
      await saveDirectoryHandle(handle);
      setStatus('Folder Steam berhasil dihubungkan!');
    } catch (err) {
      console.error(err);
      setStatus('Gagal memilih folder. Catatan: Browser melarang memilih folder di dalam Program Files.');
    }
  };

  const handleInstall = async () => {
    if (!apiKey) {
      setStatus('Error: MANIFEST_API_KEY tidak ditemukan di file .env!');
      return;
    }

    setLoading(true);
    setStatus('Sedang mengunduh manifest dari ManifestHub...');

    try {
      if (dirHandle) {
        // Verify folder write permission
        const permission = await verifyPermission(dirHandle, true);
        if (!permission) {
          throw new Error('Izin menulis ke folder Steam ditolak oleh browser.');
        }
        
        const result = await installManifestFile(dirHandle, apiKey, game.appid);
        setStatus(`Sukses memasang manifest: "${result.fileName}" langsung ke folder "${result.folderName}"!`);
      } else {
        // Fallback: direct download file
        setStatus('Mengunduh file manifest secara langsung...');
        const url = `https://api.manifesthub1.filegear-sg.me/manifest?apikey=${encodeURIComponent(apiKey)}&appid=${encodeURIComponent(game.appid)}`;
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
        
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        let fileName = `appmanifest_${game.appid}.acf`;
        const disposition = res.headers.get('Content-Disposition');
        if (disposition && disposition.indexOf('attachment') !== -1) {
          const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
          const matches = filenameRegex.exec(disposition);
          if (matches != null && matches[1]) { 
            fileName = matches[1].replace(/['"]/g, '');
          }
        }

        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        
        setStatus(`Berhasil diunduh sebagai "${fileName}"! Silakan salin file ini ke folder "Steam/steamapps/".`);
      }
    } catch (err) {
      console.error(err);
      setStatus(`Gagal: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="manifest-modal-overlay" onClick={onClose}>
      <div className="manifest-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="manifest-modal-close" onClick={onClose}>&times;</button>
        
        <div className="manifest-modal-header">
          <h2 className="manifest-modal-title">Pasang Game Manifest</h2>
          <p className="manifest-modal-subtitle">{game.title} (AppID: {game.appid})</p>
        </div>

        <div className="manifest-modal-body">
          {/* Info API Key status */}
          <div className="manifest-status-indicator">
            <span className={`dot ${apiKey ? 'active' : 'inactive'}`}></span>
            <span className="text">
              {apiKey ? 'API Key terdeteksi dari .env' : 'API Key MANIFEST_API_KEY tidak terdeteksi di .env'}
            </span>
          </div>

          {/* Steam Directory */}
          <div className="manifest-input-group">
            <label>Lokasi Folder Steam / steamapps</label>
            <div className="manifest-folder-row">
              <input 
                type="text" 
                readOnly 
                placeholder="Pilih folder Steam Anda" 
                value={dirName ? `Folder terpilih: ${dirName}` : 'Belum memilih folder'} 
              />
              <button className="manifest-folder-btn" onClick={handleSelectFolder}>Pilih Folder</button>
            </div>
            
            <div className="security-warning-box">
              <strong>⚠️ PENTING: Pembatasan Browser</strong>
              <p>
                Browser melarang pemilihan folder secara langsung di dalam <code>C:\Program Files</code> atau <code>C:\Program Files (x86)</code> demi keamanan.
              </p>
              <p>
                Jika Steam Anda terinstal di sana, silakan klik <strong>Unduh File</strong> di bawah ini, kemudian pindahkan file manifest hasil unduhan tersebut ke folder <code>Steam/steamapps/</code> secara manual.
              </p>
            </div>
          </div>

          {/* Status Message */}
          {status && (
            <div className={`manifest-status-box ${status.toLowerCase().includes('gagal') || status.toLowerCase().includes('error') ? 'error' : status.toLowerCase().includes('sukses') || status.toLowerCase().includes('berhasil') ? 'success' : ''}`}>
              {status}
            </div>
          )}
        </div>

        <div className="manifest-modal-footer">
          <button className="manifest-cancel-btn" onClick={onClose} disabled={loading}>Batal</button>
          <button className="manifest-install-btn" onClick={handleInstall} disabled={loading}>
            {loading ? <span className="manifest-mini-spinner"></span> : null}
            {dirHandle ? 'Pasang Otomatis' : 'Unduh File'}
          </button>
        </div>
      </div>
    </div>
  );
}
