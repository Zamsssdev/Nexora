import React, { useState, useEffect } from 'react';
import './Sidebar.css';
import { saveDirectoryHandle } from '../lib/manifestHelper';

export default function Sidebar({ activeTab, setActiveTab, libraryCount, steamDir, setSteamDir, isElectron, steamPath, onSelectSteamPath, onRestartSteam }) {
  const [steamPathName, setSteamPathName] = useState(localStorage.getItem('manifesthub_dirname') || '');

  // Select Steam directory on Web Mode
  const handleSelectFolder = async () => {
    try {
      if (!window.showDirectoryPicker) {
        alert('File System Access API is not supported in this browser. Manifests will be downloaded directly.');
        return;
      }
      const handle = await window.showDirectoryPicker();
      setSteamDir(handle);
      setSteamPathName(handle.name);
      localStorage.setItem('manifesthub_dirname', handle.name);
      await saveDirectoryHandle(handle);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenLink = (url) => {
    if (isElectron && window.require) {
      const shell = window.require('electron').shell;
      shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <img src="/iconapps.png" alt="Nexora Logo" className="sidebar-logo" />
        <div className="sidebar-brand-text">
          <span className="brand-name">Nexora</span>
          <span className="brand-sub">GAME LAUNCHER</span>
        </div>
      </div>
      
      <div className="sidebar-divider"></div>

      <div className="sidebar-links">
        {/* Main Section */}
        <div className="sidebar-section-title">MAIN</div>

        <button 
          className={`sidebar-link ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <div className="sidebar-link-content">
            <svg className="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="12" x2="10" y2="12"></line>
              <line x1="8" y1="10" x2="8" y2="14"></line>
              <line x1="15" y1="13" x2="15.01" y2="13"></line>
              <line x1="18" y1="11" x2="18.01" y2="11"></line>
              <rect x="2" y="6" width="20" height="12" rx="3"></rect>
            </svg>
            <span className="sidebar-text">Accounts</span>
          </div>
        </button>

        <button 
          className={`sidebar-link ${activeTab === 'bypass' ? 'active' : ''}`}
          onClick={() => setActiveTab('bypass')}
        >
          <div className="sidebar-link-content">
            <svg className="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span className="sidebar-text">Bypass</span>
          </div>
        </button>

        <button 
          className={`sidebar-link ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <div className="sidebar-link-content">
            <svg className="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <span className="sidebar-text">Library</span>
            {libraryCount > 0 && (
              <span className="sidebar-badge">{libraryCount}</span>
            )}
          </div>
        </button>

        {/* Socials Section */}
        <div className="sidebar-section-title" style={{ marginTop: '12px' }}>SOCIALS</div>

        <button 
          className="sidebar-link"
          onClick={() => handleOpenLink('https://youtube.com')}
        >
          <div className="sidebar-link-content">
            <svg className="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="10 8 16 12 10 16 10 8"></polygon>
            </svg>
            <span className="sidebar-text">YouTube</span>
          </div>
        </button>

        <button 
          className="sidebar-link"
          onClick={() => handleOpenLink('https://discord.gg')}
        >
          <div className="sidebar-link-content">
            <svg className="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span className="sidebar-text">Discord</span>
          </div>
        </button>

        <button 
          className="sidebar-link"
          onClick={() => handleOpenLink('https://github.com')}
        >
          <div className="sidebar-link-content">
            <svg className="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span className="sidebar-text">GitHub</span>
          </div>
        </button>
      </div>

      {/* Steam Status/Settings HUD */}
      <div className="sidebar-settings">
        <div className="settings-header">
          <span className="title">Steam Integration</span>
          <span className={`status-dot ${isElectron || steamDir ? 'connected' : 'disconnected'}`}></span>
        </div>
        
        {isElectron ? (
          <div className="settings-info">
            <span className="info-lbl">Platform:</span>
            <span className="info-val">Desktop (Electron)</span>
            <span className="info-lbl">Steam Path:</span>
            <span className="info-val truncate" title={steamPath || 'Not Set'}>
              {steamPath ? steamPath.split(/[\\/]/).pop() || steamPath : 'Belum diatur'}
            </span>
            <button className="sidebar-folder-btn" onClick={onSelectSteamPath}>
              Ubah Folder Steam
            </button>
            <button className="sidebar-restart-btn" onClick={onRestartSteam}>
              ⟳&nbsp; Restart Steam
            </button>
          </div>
        ) : (
          <div className="settings-info">
            <span className="info-lbl">Folder:</span>
            <span className="info-val truncate" title={steamPathName || 'Not Set'}>
              {steamPathName || 'Belum diatur'}
            </span>
            <button className="sidebar-folder-btn" onClick={handleSelectFolder}>
              {steamDir ? 'Ganti Folder' : 'Pilih Folder'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
