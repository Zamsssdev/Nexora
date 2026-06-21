import React, { useState, useEffect, useMemo } from 'react';
import './Bypass.css';
import Card from './Card';
import localAccountsData from '../data/Account.json';

// Detect if running inside Electron
const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
let ipcRenderer = null;
if (isElectron) {
  ipcRenderer = window.require('electron').ipcRenderer;
}

const GITHUB_ACCOUNTS_URL = 'https://raw.githubusercontent.com/Zamsssdev/Nexora/refs/heads/main/src/data/Account.json';

export default function Bypass({ steamPath, showToast, searchQuery = '' }) {
  const [presetAccounts, setPresetAccounts] = useState(localAccountsData);
  const [customAccounts, setCustomAccounts] = useState(() => {
    try {
      const saved = localStorage.getItem('nexora_custom_accounts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const mergedAccounts = useMemo(() => {
    const result = [...presetAccounts];
    customAccounts.forEach(custom => {
      const idx = result.findIndex(acc => acc.AppID === custom.AppID);
      if (idx > -1) {
        const existing = result[idx];
        const existingAccKeys = Object.keys(existing).filter(k => k.toLowerCase().startsWith('account'));
        let nextAccNum = existingAccKeys.length + 1;
        const mergedEntry = { ...existing };
        Object.keys(custom).forEach(key => {
          if (key.toLowerCase().startsWith('account')) {
            const accVal = custom[key];
            const isDuplicate = existingAccKeys.some(k => existing[k].username === accVal.username);
            if (!isDuplicate) {
              mergedEntry[`Account${nextAccNum}`] = accVal;
              nextAccNum++;
            }
          }
        });
        result[idx] = mergedEntry;
      } else {
        result.push(custom);
      }
    });
    return result;
  }, [presetAccounts, customAccounts]);

  const [games, setGames] = useState([]);
  const filteredGames = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return games;
    return games.filter(g => (g.title || '').toLowerCase().includes(q));
  }, [games, searchQuery]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const accountInfo = selectedGame ? mergedAccounts.find(acc => acc.AppID === selectedGame.appid) : null;
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
          setPresetAccounts(data);
        } else {
          throw new Error('Data format is not an array');
        }
      } catch (err) {
        console.warn('Failed to fetch dynamic accounts, using local fallback:', err.message);
        setPresetAccounts(localAccountsData);
      }
    }
    loadAccounts();
  }, []);

  // --- Title cache helpers (localStorage, TTL 7 days) ---
  const TITLE_CACHE_KEY = 'nexora_steam_titles';
  const TITLE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  const getCachedTitle = (appid) => {
    try {
      const raw = localStorage.getItem(TITLE_CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      const entry = cache[appid];
      if (!entry) return null;
      if (Date.now() - entry.ts > TITLE_CACHE_TTL) return null; // expired
      return entry.title;
    } catch { return null; }
  };

  const setCachedTitle = (appid, title) => {
    try {
      const raw = localStorage.getItem(TITLE_CACHE_KEY);
      const cache = raw ? JSON.parse(raw) : {};
      cache[appid] = { title, ts: Date.now() };
      localStorage.setItem(TITLE_CACHE_KEY, JSON.stringify(cache));
    } catch {}
  };

  // Update games list dynamically whenever mergedAccounts updates
  useEffect(() => {
    const uniqueAppIDs = [...new Set(mergedAccounts.map(item => item.AppID))];

    // Build initial list — use cached title if available, else show placeholder
    const list = uniqueAppIDs.map(appid => {
      const cached = getCachedTitle(appid);
      return {
        id: String(appid),
        appid: Number(appid),
        title: cached || `Loading...`,
        imageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
        bannerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
        inLibrary: false
      };
    });
    setGames(list);

    // Fetch titles for AppIDs not yet cached (or cache expired)
    const toFetch = uniqueAppIDs.filter(appid => !getCachedTitle(appid));
    if (toFetch.length === 0) return; // all titles already cached

    if (isElectron && ipcRenderer) {
      toFetch.forEach(async (appid) => {
        try {
          const res = await ipcRenderer.invoke('fetch-steam-app-details', appid);
          if (res.ok && res.data && res.data[appid] && res.data[appid].success) {
            const name = res.data[appid].data.name;
            setCachedTitle(appid, name);
            setGames(prev => prev.map(g => g.appid === appid ? { ...g, title: name } : g));
          } else {
            setGames(prev => prev.map(g => g.appid === appid ? { ...g, title: `Game ID ${appid}` } : g));
          }
        } catch (err) {
          console.error(`Failed to fetch title for AppID ${appid}:`, err);
          setGames(prev => prev.map(g => g.appid === appid ? { ...g, title: `Game ID ${appid}` } : g));
        }
      });
    }
  }, [mergedAccounts]);

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
          const isCustom = customAccounts.some(custom => {
            if (custom.AppID !== selectedGame.appid) return false;
            return Object.keys(custom).some(cKey => 
              cKey.toLowerCase().startsWith('account') && 
              custom[cKey].username === acc.username
            );
          });
          accounts.push({ ...acc, isCustom, keyInObject: key });
        }
      }
    });
    return accounts;
  };

  // Global search prop `searchQuery` filters displayed games (from Header)

  const handleDeleteCustomAccount = (username) => {
    if (!selectedGame) return;
    const appid = selectedGame.appid;
    
    setCustomAccounts(prev => {
      const updated = prev.map(item => {
        if (item.AppID !== appid) return item;
        
        const newItem = { AppID: item.AppID, Title: item.Title, Bypass: item.Bypass };
        let newIndex = 1;
        
        Object.keys(item).forEach(key => {
          if (key.toLowerCase().startsWith('account')) {
            const acc = item[key];
            if (acc.username !== username) {
              const newKey = newIndex === 1 ? 'Account' : `Account${newIndex}`;
              newItem[newKey] = acc;
              newIndex++;
            }
          }
        });
        
        return newItem;
      }).filter(item => {
        return Object.keys(item).some(key => key.toLowerCase().startsWith('account'));
      });
      
      localStorage.setItem('nexora_custom_accounts', JSON.stringify(updated));
      return updated;
    });
    
    showToast(`Akun ${username} berhasil dihapus!`, 'success');
  };

  const handleLoginSpecific = async (selectedAcc) => {
    if (isElectron && ipcRenderer) {
      try {
        setLoggingIn(true);
        showToast(`Mencoba login otomatis dengan akun: ${selectedAcc.username}`, 'info');

        const result = await ipcRenderer.invoke('login-steam', {
          username: selectedAcc.username,
          password: selectedAcc.password,
          steamPath: steamPath
        });
        if (result && result.success) {
          showToast(`Steam dibuka dengan akun ${selectedAcc.username}!`, 'success');
        }
      } catch (err) {
        console.error('Failed specific login launch:', err);
        showToast(`Gagal membuka Steam: ${err.message}`, 'error');
      } finally {
        setLoggingIn(false);
      }
    } else {
      showToast('Hanya didukung di aplikasi Desktop (Electron).', 'error');
    }
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

              <div className="bypass-accounts-section" style={{ marginTop: '25px', marginBottom: '25px' }}>
                <h3 className="bypass-requirements-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Steam Accounts</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-muted)' }}>
                    Total: {accounts.length} Akun
                  </span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {accounts.map((acc, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      background: 'rgba(255,255,255,0.03)', 
                      padding: '12px 16px', 
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: '600', color: '#fff', fontSize: '0.9rem' }}>{acc.username}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          Password: {acc.password.slice(0, 2) + '*'.repeat(acc.password.length - 2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="bypass-action-btn"
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '0.75rem', 
                            minWidth: 'auto',
                            background: 'rgba(236, 72, 153, 0.1)',
                            border: '1px solid rgba(236, 72, 153, 0.3)',
                            color: '#ec4899',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleLoginSpecific(acc)}
                          disabled={loggingIn}
                        >
                          🔑 Login
                        </button>
                        {acc.isCustom && (
                          <button 
                            className="bypass-action-btn"
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '0.75rem', 
                              minWidth: 'auto',
                              background: 'rgba(244, 67, 54, 0.1)',
                              border: '1px solid rgba(244, 67, 54, 0.3)',
                              color: '#f44336',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                            onClick={() => handleDeleteCustomAccount(acc.username)}
                          >
                            🗑️ Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '15px' }}>
            <h1 className="home-title" style={{ margin: 0 }}>Bypass &amp; Steam Sharing</h1>
          </div>

          {loadingDetails ? (
            <div className="home-loading">
              <div className="home-spinner" />
              <p>Loading game details...</p>
            </div>
          ) : filteredGames.length > 0 ? (
            <div className="home-grid">
              {filteredGames.map((game) => (
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
              <p>No games match your search or no Steam Sharing accounts configured.</p>
            </div>
          )}
        </>
      )}

      
    </div>
  );
}
