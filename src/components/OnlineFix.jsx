import React, { useState, useEffect } from 'react';
import './Bypass.css'; // Reuses Bypass styles for layout coherence

// Detect if running inside Electron
const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
let ipcRenderer = null;
if (isElectron) {
  ipcRenderer = window.require('electron').ipcRenderer;
}

export default function OnlineFix({ showToast }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Torrent Download HUD States
  const [downloadInfo, setDownloadInfo] = useState({
    status: 'idle', // idle, metadata, downloading, done, error
    name: '',
    progress: 0,
    downloadSpeed: 0,
    downloaded: 0,
    totalBytes: 0,
    timeRemaining: 0,
    path: '',
    errorMessage: ''
  });

  useEffect(() => {
    async function fetchOnlineFix() {
      try {
        const res = await fetch('https://raw.githubusercontent.com/ArnamentGames/HydraLinks/main/onlinefix.json');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (data && Array.isArray(data.downloads)) {
          setItems(data.downloads);
        }
      } catch (err) {
        console.error('Failed to fetch online fix downloads:', err);
        showToast('Gagal memuat daftar Online Fix.', 'error');
      } finally {
        setLoading(false);
      }
    }
    fetchOnlineFix();

    // Check if there is an active torrent on mount
    if (isElectron && ipcRenderer) {
      ipcRenderer.invoke('get-active-torrent-status').then((status) => {
        if (status && status.status !== 'idle') {
          setDownloadInfo(prev => ({ ...prev, ...status }));
        }
      }).catch(err => console.error(err));

      // Setup IPC listener for updates
      const handleProgressUpdate = (event, update) => {
        setDownloadInfo(prev => ({ ...prev, ...update }));
        if (update.status === 'done') {
          showToast(`Download Selesai! Game disimpan di folder NexoraDownloads.`, 'success');
        } else if (update.status === 'error') {
          showToast(`Gagal mengunduh: ${update.message}`, 'error');
        }
      };

      ipcRenderer.on('torrent-progress-update', handleProgressUpdate);
      return () => {
        ipcRenderer.removeListener('torrent-progress-update', handleProgressUpdate);
      };
    }
  }, [showToast]);

  const handleCopyMagnet = (magnet) => {
    navigator.clipboard.writeText(magnet);
    showToast('Link Magnet berhasil disalin ke clipboard!', 'success');
  };

  const handleDownload = (magnet) => {
    if (isElectron && ipcRenderer) {
      ipcRenderer.send('start-torrent-download', { magnet });
      showToast('Memulai unduhan torrent internal...', 'info');
      setDownloadInfo({
        status: 'metadata',
        name: 'Menyambungkan...',
        progress: 0,
        downloadSpeed: 0,
        downloaded: 0,
        totalBytes: 0,
        timeRemaining: 0,
        path: '',
        errorMessage: ''
      });
    } else {
      window.location.href = magnet;
      showToast('Membuka Torrent Client...', 'success');
    }
  };

  const handleCancelDownload = () => {
    if (isElectron && ipcRenderer) {
      ipcRenderer.send('cancel-torrent-download');
      showToast('Unduhan dibatalkan.', 'info');
      setDownloadInfo(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const handleOpenFolder = () => {
    if (isElectron && ipcRenderer && downloadInfo.path) {
      ipcRenderer.invoke('open-game-folder', downloadInfo.path);
    }
  };

  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (ms) => {
    if (!ms || ms === Infinity) return 'Calculating...';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    
    let timeStr = '';
    if (hours > 0) timeStr += `${hours}j `;
    if (minutes > 0) timeStr += `${minutes}m `;
    timeStr += `${seconds}d`;
    return timeStr;
  };

  const filteredItems = items.filter(item => 
    item.title && item.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="home-container" style={{ paddingBottom: downloadInfo.status !== 'idle' ? '180px' : '40px' }}>
      <div className="home-breadcrumb">
        <span className="breadcrumb-root">Online Fix</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="breadcrumb-current">Daftar Game</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', gap: '20px', flexWrap: 'wrap' }}>
        <h1 className="home-title" style={{ margin: 0 }}>Online Fix Downloads</h1>
        <input 
          type="text" 
          placeholder="Cari game..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: 'rgba(20, 20, 27, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '12px 18px',
            color: '#fff',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: '14px',
            minWidth: '280px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#ff003c';
            e.target.style.boxShadow = '0 0 15px rgba(255, 0, 60, 0.2)';
            e.target.style.background = 'rgba(30, 30, 40, 0.9)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.target.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
            e.target.style.background = 'rgba(20, 20, 27, 0.8)';
          }}
        />
      </div>

      {loading ? (
        <div className="home-loading">
          <div className="home-spinner" />
          <p>Memuat daftar Online Fix...</p>
        </div>
      ) : filteredItems.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {filteredItems.map((item, idx) => {
            const magnet = item.uris && item.uris[0];
            return (
              <div 
                key={idx} 
                className="bypass-req-card" 
                style={{ 
                  margin: 0, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  padding: '20px',
                  background: 'rgba(18, 18, 23, 0.65)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '14px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = 'rgba(255, 0, 60, 0.4)';
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(255, 0, 60, 0.15)';
                  e.currentTarget.style.background = 'rgba(24, 24, 30, 0.85)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
                  e.currentTarget.style.background = 'rgba(18, 18, 23, 0.65)';
                }}
              >
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: '600', color: '#fff', lineHeight: '1.4', letterSpacing: '0.3px' }}>
                    {item.title}
                  </h4>
                  <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', marginBottom: '20px', fontFamily: 'monospace' }}>
                    <span style={{ background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: '4px' }}>
                      Size: {item.fileSize || 'N/A'}
                    </span>
                    {item.uploadDate && (
                      <span style={{ background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: '4px' }}>
                        {new Date(item.uploadDate).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {magnet ? (
                    <>
                      <button 
                        className="bypass-action-btn primary" 
                        style={{ 
                          flex: 1, 
                          padding: '10px 16px', 
                          fontSize: '13px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '8px',
                          borderRadius: '8px'
                        }}
                        onClick={() => handleDownload(magnet)}
                      >
                        📥 Download
                      </button>
                      <button 
                        className="bypass-action-btn folder-btn" 
                        style={{ 
                          padding: '10px 16px', 
                          fontSize: '13px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          borderRadius: '8px',
                          minWidth: '50px'
                        }}
                        onClick={() => handleCopyMagnet(magnet)}
                        title="Salin Link Magnet"
                      >
                        🔗 Copy
                      </button>
                    </>
                  ) : (
                    <button className="bypass-action-btn disabled-gray" style={{ width: '100%', borderRadius: '8px' }} disabled>
                      No Link Available
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="home-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p>Tidak ditemukan game dengan nama tersebut.</p>
        </div>
      )}

      {/* Persistent Torrent Downloader HUD Panel */}
      {downloadInfo.status !== 'idle' && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '300px', // Pushed to the right of the sidebar
          right: '30px',
          background: 'rgba(18, 18, 23, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 0, 60, 0.25)',
          boxShadow: '0 -8px 40px rgba(255, 0, 60, 0.08), 0 10px 30px rgba(0,0,0,0.8)',
          borderRadius: '16px',
          padding: '20px 24px',
          zIndex: 9999,
          fontFamily: 'inherit',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="toast-icon" style={{ color: '#ff003c', animation: downloadInfo.status === 'downloading' ? 'spin 2s linear infinite' : 'none' }}>
                {downloadInfo.status === 'done' ? '✓' : '⚙'}
              </span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
                  {downloadInfo.status === 'metadata' && 'MENGAMBIL METADATA GAME...'}
                  {downloadInfo.status === 'downloading' && 'SEDANG MENGUNDUH GAME (INTERNAL)...'}
                  {downloadInfo.status === 'done' && 'UNDUHAN SELESAI!'}
                  {downloadInfo.status === 'error' && 'UNDUHAN GAGAL!'}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '2px', maxWidth: '500px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {downloadInfo.name}
                </div>
              </div>
            </div>
            
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {downloadInfo.status === 'done' && (
                <button 
                  className="bypass-action-btn folder-btn"
                  style={{ padding: '8px 16px', minWidth: 'auto', fontSize: '13px', borderRadius: '6px' }}
                  onClick={handleOpenFolder}
                >
                  📂 Buka Folder
                </button>
              )}
              <button 
                className="bypass-action-btn primary"
                style={{ 
                  background: 'rgba(255,255,255,0.06)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  padding: '8px 16px', 
                  minWidth: 'auto', 
                  fontSize: '13px', 
                  borderRadius: '6px',
                  boxShadow: 'none'
                }}
                onClick={handleCancelDownload}
              >
                {downloadInfo.status === 'done' ? 'Tutup' : 'Batal'}
              </button>
            </div>
          </div>

          {/* Progress bar container */}
          {downloadInfo.status !== 'done' && downloadInfo.status !== 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Progress bar line */}
              <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${(downloadInfo.progress * 100).toFixed(1)}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #ff003c 0%, #ff5588 100%)', 
                  borderRadius: '3px',
                  boxShadow: '0 0 8px rgba(255, 0, 60, 0.5)',
                  transition: 'width 0.4s ease'
                }} />
              </div>
              
              {/* Stats values */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                <span>Progress: {((downloadInfo.progress || 0) * 100).toFixed(1)}% ({formatSize(downloadInfo.downloaded)} / {formatSize(downloadInfo.totalBytes)})</span>
                <span style={{ display: 'flex', gap: '16px' }}>
                  <span>Speed: {formatSpeed(downloadInfo.downloadSpeed)}</span>
                  <span>ETA: {formatTime(downloadInfo.timeRemaining)}</span>
                </span>
              </div>
            </div>
          )}

          {downloadInfo.status === 'error' && (
            <div style={{ fontSize: '12px', color: '#ff3366', fontFamily: 'monospace' }}>
              Error: {downloadInfo.errorMessage || 'Unknown engine error occurred.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
