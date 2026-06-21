import React, { useState, useEffect } from 'react'
import './App.css'
import wallpaperbg from './assets/Bg.mp4'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import Library from './components/Library'
import Bypass from './components/Bypass'
import { loadDirectoryHandle, verifyPermission, installManifestFile } from './lib/manifestHelper'
import { supabase } from './lib/supabaseClient'
import emptypfp from './assets/emptypfp.webp'

// Check if running inside Electron
const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [library, setLibrary] = useState([]);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [steamDir, setSteamDir] = useState(null);
  const [steamPath, setSteamPath] = useState(localStorage.getItem('steam_path') || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Auth & Discord Gate States
  const [user, setUser] = useState(null);
  const [discordJoined, setDiscordJoined] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: '' });
    }, 4500);
  };

  const checkDiscordMembership = async (providerToken) => {
    try {
      console.log('Starting Discord membership check with token:', providerToken ? 'Exists' : 'Null');
      const res = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: {
          Authorization: `Bearer ${providerToken}`
        }
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Discord API response not OK:', res.status, errorText);
        showToast(`Discord API Error: ${res.status}`, 'error');
        return { isMember: false, error: `HTTP ${res.status}: ${errorText}` };
      }
      const guilds = await res.json();
      console.log('Fetched guilds list:', guilds);
      const targetGuildId = '1425015515352666195';
      
      // Check if target guild exists in the user's guild list
      const targetGuild = guilds.find(g => String(g.id) === targetGuildId);
      const isMember = !!targetGuild;
      
      console.log('Discord target guild check results:', { isMember, targetGuild, targetGuildId, totalGuilds: guilds.length });
      
      if (isMember) {
        localStorage.setItem('discord_member_verified', 'true');
      }
      return { isMember };
    } catch (err) {
      console.error('Error verifying discord membership:', err);
      return { isMember: false, error: err.message };
    }
  };

  const openDiscordInvite = () => {
    const inviteUrl = 'https://discord.gg/ZjBQ8MC2tz';
    if (isElectron) {
      const ipcRenderer = window.require('electron').ipcRenderer;
      ipcRenderer.send('open-external', inviteUrl);
    } else {
      window.open(inviteUrl, '_blank');
    }
  };

  const handleLogin = async () => {
    try {
      setLoginLoading(true);
      setLoginMessage(`Redirecting to Discord...`);
      
      if (isElectron) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            scopes: 'identify email guilds',
            redirectTo: 'http://localhost:5175',
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        
        if (data?.url) {
          const ipcRenderer = window.require('electron').ipcRenderer;
          ipcRenderer.send('open-external', data.url);
          setLoginMessage('Please complete login in your browser...');
          setTimeout(() => {
            setLoginLoading(false);
          }, 6000);
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            scopes: 'identify email guilds',
            redirectTo: window.location.origin
          }
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error logging in with Discord:', error.message);
      showToast(`Authentication failed: ${error.message}`, 'error');
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setDiscordJoined(false);
      localStorage.removeItem('discord_member_verified');
      showToast('Successfully logged out.', 'info');
    } catch (error) {
      console.error('Error logging out:', error.message);
    }
  };
  const handleAuthChange = async (session) => {
    if (session && session.user) {
      const u = {
        username: session.user.user_metadata.full_name || session.user.user_metadata.name || session.user.email,
        avatarUrl: session.user.user_metadata.avatar_url || session.user.user_metadata.picture || emptypfp,
        provider: session.user.app_metadata.provider
      };
      setUser(u);

      const providerToken = session.provider_token || localStorage.getItem('discord_provider_token');
      if (session.provider_token) {
        localStorage.setItem('discord_provider_token', session.provider_token);
      }

      // --- FIX: Jika sudah pernah diverifikasi, skip Discord API (mencegah verify ulang saat minimize/restore) ---
      const cachedVerification = localStorage.getItem('discord_member_verified') === 'true';
      if (cachedVerification) {
        setDiscordJoined(true);
        setCheckingAuth(false);
        return;
      }

      // Hanya hit Discord API jika belum pernah verified
      if (providerToken) {
        setCheckingAuth(true);
        const check = await checkDiscordMembership(providerToken);
        if (check.isMember) {
          setDiscordJoined(true);
        } else {
          setDiscordJoined(false);
          openDiscordInvite();
        }
        setCheckingAuth(false);
      } else {
        setDiscordJoined(false);
        setCheckingAuth(false);
      }
    } else {
      setUser(null);
      setDiscordJoined(false);
      setCheckingAuth(false);
      localStorage.removeItem('discord_member_verified');
      localStorage.removeItem('discord_provider_token');
    }
  };
  // Load directory handle and listen to auth state
  useEffect(() => {
    // Safety timeout: if Supabase doesn't respond in 5s (e.g. empty credentials), unblock the UI
    const authTimeout = setTimeout(() => {
      console.warn('[Nexora] Auth check timed out — check your .env Supabase credentials!');
      setCheckingAuth(false);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(authTimeout);
      handleAuthChange(session);
    }).catch(err => {
      clearTimeout(authTimeout);
      console.error(err);
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session);
    });

    if (!isElectron) {
      loadDirectoryHandle().then((handle) => {
        if (handle) setSteamDir(handle);
      }).catch(err => console.error('Error loading dir handle', err));

      if (window.location.hash.includes('access_token=')) {
        const hash = window.location.hash;
        const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
        const url = `toolsteam://auth?${cleanHash}`;
        window.location.href = url;
      }
    } else {
      const ipcRenderer = window.require('electron').ipcRenderer;
      
      const syncLocalLibrary = async (path) => {
        try {
          const locals = await ipcRenderer.invoke('scan-local-manifests', path);
          if (locals && locals.length > 0) {
            const mappedLocals = locals.map(m => ({
              id: String(m.appid),
              appid: m.appid,
              title: m.title,
              owners: 'N/A',
              imageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${m.appid}/library_600x900.jpg`,
              inLibrary: true
            }));
            setLibrary(mappedLocals);
          }
        } catch (e) {
          console.error('Failed to sync local manifest:', e.message);
        }
      };

      if (!localStorage.getItem('steam_path')) {
        ipcRenderer.invoke('get-steam-path').then((detectedPath) => {
          if (detectedPath) {
            setSteamPath(detectedPath);
            localStorage.setItem('steam_path', detectedPath);
            showToast('Lokasi Steam terdeteksi otomatis!', 'info');
            syncLocalLibrary(detectedPath);
          }
        }).catch(err => console.error('Gagal mendeteksi path Steam:', err));
      } else {
        syncLocalLibrary(localStorage.getItem('steam_path'));
      }

      const handleAuthSession = async (event, sessionData) => {
        try {
          if (sessionData.provider_token) {
            localStorage.setItem('discord_provider_token', sessionData.provider_token);
          }
          const { error } = await supabase.auth.setSession(sessionData);
          if (error) throw error;
          showToast('Login Berhasil!', 'success');
        } catch (err) {
          showToast(`Otentikasi Gagal: ${err.message}`, 'error');
        }
      };

      ipcRenderer.on('auth-session', handleAuthSession);
      return () => {
        ipcRenderer.removeListener('auth-session', handleAuthSession);
        subscription.unsubscribe();
      };
    }

    return () => {
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectSteamPath = async () => {
    if (isElectron) {
      try {
        const ipcRenderer = window.require('electron').ipcRenderer;
        const path = await ipcRenderer.invoke('select-steam-path');
        if (path) {
          setSteamPath(path);
          localStorage.setItem('steam_path', path);
          showToast('Path Steam berhasil disimpan!', 'success');
          
          const locals = await ipcRenderer.invoke('scan-local-manifests', path);
          const mappedLocals = locals.map(m => ({
            id: String(m.appid),
            appid: m.appid,
            title: m.title,
            owners: 'N/A',
            imageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${m.appid}/library_600x900.jpg`,
            inLibrary: true
          }));
          setLibrary(mappedLocals);
        }
      } catch (err) {
        showToast(`Gagal memilih folder: ${err.message}`, 'error');
      }
    }
  };

  const handleRestartSteam = async () => {
    if (isElectron) {
      try {
        const ipcRenderer = window.require('electron').ipcRenderer;
        showToast('Mematikan & memuat ulang Steam...', 'info');
        const result = await ipcRenderer.invoke('restart-steam', steamPath);
        if (result && result.success) {
          showToast('Steam berhasil direstart!', 'success');
        }
      } catch (err) {
        showToast(`Gagal restart Steam: ${err.message}`, 'error');
      }
    }
  };

  const toggleLibrary = async (game) => {
    const exists = library.some((g) => g.id === String(game.id));
    
    if (exists) {
      setLibrary((prev) => prev.filter((g) => g.id !== String(game.id)));
      
      try {
        if (isElectron) {
          const ipcRenderer = window.require('electron').ipcRenderer;
          await ipcRenderer.invoke('uninstall-manifest', {
            appid: game.appid,
            steamPath: steamPath
          });
          showToast(`Dihapus dari Library & manifest dihapus dari disk!`, 'info');
        } else {
          showToast(`Dihapus dari Library: ${game.title}`, 'info');
        }
      } catch (err) {
        console.error(err);
        showToast(`Gagal menghapus manifest dari disk: ${err.message}`, 'error');
      }
    } else {
      setLibrary((prev) => [...prev, { ...game, id: String(game.id), inLibrary: true }]);
      
      const apiKey = import.meta.env.MANIFEST_API_KEY || '';
      if (!apiKey) {
        showToast('MANIFEST_API_KEY tidak ditemukan di file .env!', 'error');
        return;
      }

      showToast(`Mengunduh manifest untuk ${game.title}...`, 'info');

      try {
        if (isElectron) {
          const ipcRenderer = window.require('electron').ipcRenderer;
          const result = await ipcRenderer.invoke('install-manifest', { 
            apikey: apiKey, 
            appid: game.appid,
            steamPath: steamPath
          });
          showToast(`Sukses memasang bypass ${game.title}: ${result.manifestsDownloaded} manifest & ${result.configsDownloaded} config terpasang!`, 'success');
          try {
            await ipcRenderer.invoke('discord-notify-game', {
              gameTitle: game.title,
              appid: game.appid,
              action: 'Added',
              details: `Manifest installed with ${result.manifestsDownloaded} manifest(s) and ${result.configsDownloaded} config file(s).`
            });
          } catch (notifyErr) {
            console.error('Discord notification failed:', notifyErr);
          }
        } else {
          if (steamDir) {
            const hasWritePermission = await verifyPermission(steamDir, true);
            if (!hasWritePermission) {
              throw new Error('Izin akses folder ditolak browser.');
            }
            const result = await installManifestFile(steamDir, apiKey, game.appid);
            showToast(`Sukses memasang manifest: "${result.fileName}" ke folder "${result.folderName}"!`, 'success');
          } else {
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
            
            showToast(`Berhasil diunduh: "${fileName}"! Silakan salin ke folder Steam/steamapps/`, 'success');
          }
        }
      } catch (err) {
        console.error(err);
        showToast(`Gagal memasang manifest: ${err.message}`, 'error');
      }
    }
  };

  // Render Open in Desktop page if opened in a web browser (non-Electron)
  if (!isElectron) {
    return (
      <div className="login-gate-container">
        <div className="login-gate-glow"></div>
        <div className="login-gate-card">
          <div className="login-gate-logo">NE<span>XO</span>RA<span>.</span></div>
          <h2 className="login-gate-title">Open in Desktop!</h2>
          <p className="login-gate-desc" style={{ marginBottom: '25px', opacity: 0.8 }}>
            Aplikasi ini hanya dapat dijalankan melalui aplikasi desktop Nexora.
          </p>
          <div className="login-gate-actions">
            <a 
              className="login-gate-btn" 
              href="toolsteam://"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                gap: '8px',
                fontWeight: '600'
              }}
            >
              Open in Desktop
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Render full screen login gate if verifying credentials or user not logged in / not in server
  if (checkingAuth) {
    return (
      <div className="login-gate-container">
        <div className="login-gate-glow"></div>
        <div className="login-gate-card">
          <div className="login-gate-logo">NE<span>XO</span>RA<span>.</span></div>
          <div className="login-gate-loading">
            <div className="spinner"></div>
            <div className="loading-text">VERIFYING TERMINAL CREDENTIALS...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !discordJoined) {
    return (
      <div className="login-gate-container">
        <div className="login-gate-glow"></div>
        <div className="login-gate-card">
          <div className="login-gate-logo">NE<span>XO</span>RA<span>.</span></div>
          
          {loginLoading ? (
            <div className="login-gate-loading">
              <div className="spinner"></div>
              <div className="loading-text">{loginMessage}</div>
            </div>
          ) : !user ? (
            <>
              <h2 className="login-gate-title">Access Restricted</h2>
              <p className="login-gate-desc">
                Authorized entry only. You must connect your Discord account and join our server to access the terminal.
              </p>
              <div className="login-gate-actions">
                <button className="login-gate-btn" onClick={handleLogin}>
                  <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
                    <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,67.43,67.43,0,0,1-10.5-5c.88-.65,1.72-1.33,2.53-2a75.46,75.46,0,0,0,73,0c.81.71,1.65,1.39,2.53,2a67.75,67.75,0,0,1-10.5,5,78.37,78.37,0,0,0,6.63,10.85,105.54,105.54,0,0,0,32.61-18.83C129.74,48.51,123.63,25.75,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
                  </svg>
                  Connect with Discord
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '25px' }}>
                <img 
                  src={user.avatarUrl} 
                  alt="Discord Avatar" 
                  style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid #ff003c', boxShadow: '0 0 15px rgba(255, 0, 60, 0.4)' }} 
                />
                <div style={{ marginTop: '12px', fontSize: '1.25rem', fontWeight: '700', letterSpacing: '0.5px' }}>{user.username}</div>
              </div>
              <h2 className="login-gate-title">Join Discord Required</h2>
              <p className="login-gate-desc">
                You are authenticated, but you must join our official Discord server to gain terminal access.
              </p>
              <div className="login-gate-actions">
                <button className="login-gate-btn secondary-btn" onClick={openDiscordInvite}>
                  Join Discord Server
                </button>
                <button className="login-gate-btn" onClick={handleLogin}>
                  Verify Membership
                </button>
                <button className="login-gate-btn tertiary-btn" onClick={handleLogout}>
                  Use Different Account
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <video
        id="bg-video" autoPlay muted loop playsInline>
        <source src={wallpaperbg} type="video/mp4" />
      </video>

      <Header user={user} onLogout={handleLogout} onSearch={setSearchQuery} />

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        libraryCount={library.length} 
        steamDir={steamDir}
        setSteamDir={setSteamDir}
        isElectron={isElectron}
        steamPath={steamPath}
        onSelectSteamPath={handleSelectSteamPath}
        onRestartSteam={handleRestartSteam}
      />

      <div className="main-content">
        {activeTab === 'home' && (
          <Home library={library} toggleLibrary={toggleLibrary} />
        )}
        {activeTab === 'bypass' && (
          <Bypass steamPath={steamPath} showToast={showToast} searchQuery={searchQuery} />
        )}
        {activeTab === 'library' && (
          <Library library={library} toggleLibrary={toggleLibrary} />
        )}
      </div>

      {/* Toast Notification HUD */}
      {toast.show && (
        <div className={`toast-hud ${toast.type}`}>
          <div className="toast-glow"></div>
          <div className="toast-content">
            <span className="toast-icon">
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'info' && 'ℹ'}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}
    </>
  )
}

export default App
