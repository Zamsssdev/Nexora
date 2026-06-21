import React, { useState, useEffect } from 'react';
import './Bypass.css';
import Card from './Card';
import localAccountsData from '../data/Account.json';

// Detect if running inside Electron
const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
let ipcRenderer = null;
if (isElectron) {
  ipcRenderer = window.require('electron').ipcRenderer;
}

const GITHUB_ACCOUNTS_URL = 'https://raw.githubusercontent.com/Zamsssdev/Nexora/refs/heads/main/Account.json';

export default function Bypass({ steamPath, showToast }) {
  const [accountsData, setAccountsData] = useState(localAccountsData);
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const accountInfo = selectedGame ? accountsData.find(acc => acc.AppID === selectedGame.appid) : null;
  const hasBypass = accountInfo && Array.isArray(accountInfo.Bypass) && accountInfo.Bypass.length > 0;

  const [gamePath, setGamePath] = useState('');
  const [fileStatus, setFileStatus] = useState({}); // Stores key-value: { fileName: existsBool }
  const [triedAccounts, setTriedAccounts] = useState([]); // Usernames tried in current session for selected game

  // Reset tried accounts when game changes
  useEffect(() => {
    setTriedAccounts([]);
  }, [selectedGame]);

  useEffect(() => {
    if (selectedGame) {
      setGamePath(localStorage.getItem(`game_path_${selectedGame.appid}`) || '');
    }
  }, [selectedGame]);

  useEffect(() => {
    async function checkFiles() {
      if (isElectron && ipcRenderer && gamePath && selectedGame && hasBypass) {
        const status = {};
        for (const item of accountInfo.Bypass) {
          const exists = await ipcRenderer.invoke('check-file-exists', { dirPath: gamePath, fileName: item.file });
          status[item.file] = exists;
        }
        setFileStatus(status);
      } else {
        setFileStatus({});
      }
    }
    checkFiles();
  }, [gamePath, selectedGame, hasBypass, accountInfo]);

  const handleSelectGameFolder = async () => {
    if (isElectron && ipcRenderer) {
      const path = await ipcRenderer.invoke('select-folder');
      if (path) {
        setGamePath(path);
        localStorage.setItem(`game_path_${selectedGame.appid}`, path);
        showToast('Folder Game berhasil diatur!', 'success');
      }
    }
  };

  const handleLaunchGame = async () => {
    if (!gamePath) {
      showToast('Path game belum diatur!', 'error');
      return;
    }
    let exeName = `${selectedGame.title.split(' ')[0]}.exe`;
    if (hasBypass) {
      const exeItem = accountInfo.Bypass.find(item => item.file.endsWith('.exe'));
      if (exeItem) exeName = exeItem.file;
    }
    
    if (isElectron && ipcRenderer) {
      try {
        await ipcRenderer.invoke('launch-game', { dirPath: gamePath, exeName });
        showToast('Menjalankan game...', 'success');
      } catch (err) {
        showToast(`Gagal menjalankan game: ${err.message}`, 'error');
      }
    }
  };

  const handleOpenGameFolder = async () => {
    if (!gamePath) {
      showToast('Path game belum diatur!', 'error');
      return;
    }
    if (isElectron && ipcRenderer) {
      try {
        await ipcRenderer.invoke('open-game-folder', gamePath);
      } catch (err) {
        showToast(`Gagal membuka folder: ${err.message}`, 'error');
      }
    }
  };

  const handleOpenWindowsSecurity = async () => {
    if (isElectron && ipcRenderer) {
      try {
        await ipcRenderer.invoke('open-windows-security');
        showToast('Membuka Windows Security...', 'success');
      } catch (err) {
        showToast(`Gagal membuka Windows Security: ${err.message}`, 'error');
      }
    }
  };

  const handleInjectBypass = async () => {
    if (!gamePath || !hasBypass) {
      showToast('Mohon tentukan Game Path terlebih dahulu!', 'error');
      return;
    }

    setInjecting(true);
    showToast(`Memulai proses inject bypass...`, 'info');

    try {
      if (isElectron && ipcRenderer) {
        let successCount = 0;
        for (const item of accountInfo.Bypass) {
          showToast(`Mengunduh & menimpa file ${item.file}...`, 'info');
          const result = await ipcRenderer.invoke('download-and-overwrite', {
            url: item.url,
            dirPath: gamePath,
            fileName: item.file
          });
          if (result && result.success) {
            successCount++;
          }
        }
        
        if (successCount === accountInfo.Bypass.length) {
          showToast(`Sukses menginjeksi ${successCount} file bypass!`, 'success');
        } else {
          showToast(`Berhasil menginjeksi ${successCount}/${accountInfo.Bypass.length} file bypass.`, 'warning');
        }

        // Re-check files status
        const status = {};
        for (const item of accountInfo.Bypass) {
          const exists = await ipcRenderer.invoke('check-file-exists', { dirPath: gamePath, fileName: item.file });
          status[item.file] = exists;
        }
        setFileStatus(status);
      }
    } catch (err) {
      console.error(err);
      showToast(`Gagal menimpa file: ${err.message}`, 'error');
    } finally {
      setInjecting(false);
    }
  };

  // Fetch accounts data from GitHub on mount
  useEffect(() => {
    async function loadAccounts() {
      try {
        const response = await fetch(GITHUB_ACCOUNTS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          setAccountsData(data);
          initializeGames(data);
        } else {
          throw new Error('Data format is not an array');
        }
      } catch (err) {
        console.warn('Failed to fetch dynamic accounts, using local fallback:', err.message);
        initializeGames(localAccountsData);
      }
    }

    function initializeGames(data) {
      const uniqueAppIDs = [...new Set(data.map(item => item.AppID))];
      const list = uniqueAppIDs.map(appid => ({
        id: String(appid),
        appid: Number(appid),
        title: `Loading Game ${appid}...`,
        imageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
        bannerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
        inLibrary: false
      }));
      setGames(list);

      if (isElectron && ipcRenderer) {
        uniqueAppIDs.forEach(async (appid) => {
          try {
            const res = await ipcRenderer.invoke('fetch-steam-app-details', appid);
            if (res.ok && res.data && res.data[appid] && res.data[appid].success) {
              const name = res.data[appid].data.name;
              setGames(prev => prev.map(g => g.appid === appid ? { ...g, title: name } : g));
            } else {
              setGames(prev => prev.map(g => g.appid === appid ? { ...g, title: `Game ID ${appid}` } : g));
            }
          } catch (err) {
            console.error(`Failed to fetch title for AppID ${appid}:`, err);
            setGames(prev => prev.map(g => g.appid === appid ? { ...g, title: `Game ID ${appid}` } : g));
          }
        });
      } else {
        uniqueAppIDs.forEach(async (appid) => {
          setGames(prev => prev.map(g => g.appid === appid ? { ...g, title: `Game ID ${appid}` } : g));
        });
      }
    }

    loadAccounts();
  }, []);

  // Fetch full details when a game is selected
  const handleGameSelect = async (game) => {
    setSelectedGame(game);
    setLoadingDetails(true);
    
    const fallback = {
      title: game.title,
      description: "No description available.",
      developer: "Unknown",
      publisher: "Unknown",
      releaseDate: "N/A",
      metacritic: "N/A",
      categories: ["Game"],
      minRequirements: "N/A",
      recRequirements: "N/A"
    };

    if (isElectron && ipcRenderer) {
      try {
        const res = await ipcRenderer.invoke('fetch-steam-app-details', game.appid);
        if (res.ok && res.data && res.data[game.appid] && res.data[game.appid].success) {
          const apiData = res.data[game.appid].data;
          
          const cleanHtml = (html) => {
            if (!html) return 'N/A';
            return html
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .replace(/&quot;/g, '"')
              .trim();
          };

          setGameDetails({
            title: apiData.name || game.title,
            description: cleanHtml(apiData.detailed_description || apiData.short_description || fallback.description),
            developer: apiData.developers ? apiData.developers.join(', ') : fallback.developer,
            publisher: apiData.publishers ? apiData.publishers.join(', ') : fallback.publisher,
            releaseDate: apiData.release_date ? apiData.release_date.date : fallback.releaseDate,
            metacritic: apiData.metacritic ? `${apiData.metacritic.score} (Meta)` : fallback.metacritic,
            categories: apiData.categories ? apiData.categories.map(c => c.description) : (apiData.genres ? apiData.genres.map(g => g.description) : fallback.categories),
            minRequirements: apiData.pc_requirements ? cleanHtml(apiData.pc_requirements.minimum) : fallback.minRequirements,
            recRequirements: apiData.pc_requirements ? cleanHtml(apiData.pc_requirements.recommended) : fallback.recRequirements
          });
        } else {
          setGameDetails(fallback);
        }
      } catch (err) {
        console.error("Error fetching app details:", err);
        setGameDetails(fallback);
      } finally {
        setLoadingDetails(false);
      }
    } else {
      setGameDetails(fallback);
      setLoadingDetails(false);
    }
  };

  // Get list of all accounts for the currently selected game
  const getGameAccounts = () => {
    if (!accountInfo) return [];
    const accounts = [];
    Object.keys(accountInfo).forEach(key => {
      if (key.toLowerCase().startsWith('account')) {
        const acc = accountInfo[key];
        if (acc && acc.username && acc.password) {
          accounts.push(acc);
        }
      }
    });
    return accounts;
  };

  const handleLoginRandom = async () => {
    if (!selectedGame) return;

    const accounts = getGameAccounts();
    if (accounts.length === 0) {
      showToast('Tidak ada akun Steam Sharing yang tersedia untuk game ini.', 'error');
      return;
    }

    // Filter out accounts already tried
    let availableAccounts = accounts.filter(acc => !triedAccounts.includes(acc.username));
    
    // If all accounts have been tried, reset history and use all
    if (availableAccounts.length === 0) {
      availableAccounts = accounts;
      setTriedAccounts([]);
    }

    const randomIndex = Math.floor(Math.random() * availableAccounts.length);
    const selectedAcc = availableAccounts[randomIndex];

    if (!selectedAcc || !selectedAcc.username || !selectedAcc.password) {
      showToast('Kredensial akun tidak lengkap atau tidak valid.', 'error');
      return;
    }

    // Add this username to tried list
    setTriedAccounts(prev => [...prev, selectedAcc.username]);

    if (isElectron && ipcRenderer) {
      try {
        setLoggingIn(true);
        const nextIndex = triedAccounts.length + 1;
        const total = accounts.length;
        showToast(`[${nextIndex}/${total}] Mencoba login otomatis dengan akun: ${selectedAcc.username}`, 'info');
        
        const result = await ipcRenderer.invoke('login-steam', {
          username: selectedAcc.username,
          password: selectedAcc.password,
          steamPath: steamPath
        });
        if (result && result.success) {
          showToast(`Steam dibuka dengan akun ${selectedAcc.username}! Jika gagal login, klik tombol lagi untuk mencoba akun selanjutnya.`, 'success');
        }
      } catch (err) {
        console.error('Failed auto login launch:', err);
        showToast(`Gagal membuka Steam: ${err.message}`, 'error');
      } finally {
        setLoggingIn(false);
      }
    } else {
      showToast('Hanya didukung di aplikasi Desktop (Electron).', 'error');
    }
  };

  const allFilesExist = hasBypass && accountInfo.Bypass.every(item => fileStatus[item.file]);
  const accounts = getGameAccounts();
  const untriedCount = accounts.length - triedAccounts.length;

  return (
    <div className="home-container">
      {selectedGame && gameDetails ? (
        <div className="bypass-details-container">
          {/* Back Button */}
          <button className="bypass-back-btn" onClick={() => { setSelectedGame(null); setGameDetails(null); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Games
          </button>

          {/* Content Columns */}
          <div className="bypass-details-columns">
            {/* Left Column: Image & Meta Cards */}
            <div className="bypass-details-left">
              <div className="bypass-banner-card">
                <img 
                  src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${selectedGame.appid}/library_600x900.jpg`} 
                  alt={selectedGame.title} 
                  className="bypass-banner-img"
                />
              </div>

              <div className="bypass-meta-grid">
                <div className="bypass-meta-item">
                  <span className="bypass-meta-label">RELEASE DATE</span>
                  <span className="bypass-meta-value">{gameDetails.releaseDate}</span>
                </div>
                <div className="bypass-meta-item">
                  <span className="bypass-meta-label">METACRITIC</span>
                  <span className="bypass-meta-value">{gameDetails.metacritic}</span>
                </div>
                <div className="bypass-meta-item">
                  <span className="bypass-meta-label">DEVELOPER</span>
                  <span className="bypass-meta-value">{gameDetails.developer}</span>
                </div>
                <div className="bypass-meta-item">
                  <span className="bypass-meta-label">PUBLISHER</span>
                  <span className="bypass-meta-value">{gameDetails.publisher}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Title, Description, Tags, Requirements */}
            <div className="bypass-details-right">
              <h1 className="bypass-game-title">{gameDetails.title}</h1>
              
              {hasBypass ? (
                <div className="bypass-status-row">
                  {gamePath ? (
                    allFilesExist ? (
                      <span className="bypass-status-indicator ready">• ALL BYPASS FILES DETECTED (READY)</span>
                    ) : (
                      <span className="bypass-status-indicator warning">• SOME BYPASS FILES MISSING</span>
                    )
                  ) : (
                    <span className="bypass-status-indicator error">• PATH NOT SPECIFIED</span>
                  )}
                </div>
              ) : (
                <div className="bypass-steam-id">STEAM ID: {selectedGame.appid}</div>
              )}
              
              <p className="bypass-game-description">{gameDetails.description}</p>

              {hasBypass && (
                <div className="bypass-path-section">
                  <div className="bypass-field-group">
                    <label className="bypass-field-label">GAME PATH</label>
                    <div className="bypass-path-input-wrapper">
                      <input type="text" readOnly className="bypass-path-input" value={gamePath || 'Not set'} />
                      <button className="bypass-path-btn" onClick={handleSelectGameFolder}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Detector Files Status */}
                  <div className="bypass-detector-fields" style={{ marginTop: '15px' }}>
                    <label className="bypass-field-label">REQUIRED BYPASS FILES DETECTOR</label>
                    <div className="bypass-files-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '5px' }}>
                      {accountInfo.Bypass.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '4px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{item.file}</span>
                          <span style={{ 
                            fontSize: '11px', 
                            fontWeight: 'bold', 
                            color: fileStatus[item.file] ? '#4caf50' : '#f44336',
                            background: fileStatus[item.file] ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)',
                            padding: '2px 6px',
                            borderRadius: '3px'
                          }}>
                            {fileStatus[item.file] ? 'DETECTED' : 'MISSING'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bypass-warning-box">
                    <div className="bypass-warning-content">
                      <svg className="bypass-warning-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      <span>This bypass requires adding the game folder to Windows Security exclusions.</span>
                    </div>
                    <button className="bypass-warning-btn" onClick={handleOpenWindowsSecurity}>Open Windows Security</button>
                  </div>
                </div>
              )}

              <div className="bypass-tags-list">
                {gameDetails.categories && gameDetails.categories.map((cat, idx) => (
                  <span key={idx} className="bypass-tag-pill">{cat}</span>
                ))}
              </div>

              <h3 className="bypass-requirements-title">System Requirements</h3>
              <div className="bypass-requirements-grid">
                <div className="bypass-req-card">
                  <span className="bypass-req-card-label">MINIMUM</span>
                  <pre className="bypass-req-content">{gameDetails.minRequirements}</pre>
                </div>
                <div className="bypass-req-card">
                  <span className="bypass-req-card-label">RECOMMENDED</span>
                  <pre className="bypass-req-content">{gameDetails.recRequirements}</pre>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="bypass-actions-bar">
            <button 
              className="bypass-action-btn primary" 
              onClick={handleLoginRandom}
              disabled={loggingIn || accounts.length === 0}
            >
              {loggingIn 
                ? 'Logging in...' 
                : accounts.length > 1 
                  ? `Login (Try Account ${triedAccounts.length + 1}/${accounts.length})` 
                  : 'Login with Account'
              }
            </button>
            
            {hasBypass ? (
              <>
                <button 
                  className="bypass-action-btn success-btn" 
                  onClick={handleLaunchGame}
                  disabled={!gamePath}
                >
                  ▶ Launch
                </button>
                <button 
                  className="bypass-action-btn folder-btn" 
                  onClick={handleOpenGameFolder}
                  disabled={!gamePath}
                >
                  📂 Open Folder
                </button>
                <button 
                  className="bypass-action-btn inject-btn" 
                  onClick={handleInjectBypass}
                  disabled={injecting || !gamePath}
                >
                  {injecting ? 'Injecting...' : '📥 Inject'}
                </button>
              </>
            ) : (
              <button 
                className="bypass-action-btn secondary disabled-gray" 
                disabled={true}
              >
                Inject Bypass
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="home-breadcrumb">
            <span className="breadcrumb-root">Bypass &amp; Steam Sharing</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="breadcrumb-current">Available Accounts</span>
          </div>

          <h1 className="home-title">Bypass &amp; Steam Sharing</h1>

          {loadingDetails ? (
            <div className="home-loading">
              <div className="home-spinner" />
              <p>Loading game details...</p>
            </div>
          ) : games.length > 0 ? (
            <div className="home-grid">
              {games.map((game) => (
                <Card
                  key={game.id}
                  game={game}
                  inLibrary={false}
                  hideActions={true}
                  onClick={() => handleGameSelect(game)}
                />
              ))}
            </div>
          ) : (
            <div className="home-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <p>No Steam Sharing accounts configured in Account.json.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
