import React, { useState, useEffect, useRef } from 'react';
import './Header.css';
import emptypfp from '../assets/emptypfp.webp';

export default function Header({ user, onLogout, onSearch }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowDropdown(false);
    if (onLogout) onLogout();
  };

  return (
    <>
      <header className="header-container">
        <div className="header-logo" onClick={() => window.location.reload()}>
          <div className="logo-text">
            NE<span>XO</span>RA<span>.</span>
          </div>
        </div>

        <div className="header-right-group">
          <div className="search-wrapper">
            <input
              type="text"
              className="search-input"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (onSearch) onSearch(e.target.value);
              }}
            />
            <span className="search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
          </div>

          <div className="user-panel" ref={dropdownRef}>
            {user ? (
              <>
                <button className="bracket-btn" onClick={() => setShowDropdown(!showDropdown)}>
                  <span className="bracket-left">【</span>
                  <span className="btn-text">{user.username}</span>
                  <span className="bracket-right">】</span>
                </button>

                <div className="avatar-wrapper active" onClick={() => setShowDropdown(!showDropdown)}>
                  <img
                    src={user.avatarUrl || emptypfp}
                    alt="Profile"
                    className="avatar-img"
                  />
                  <div className="status-ring"></div>
                </div>

                {showDropdown && (
                  <div className="dropdown-menu">
                    <button className="dropdown-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      My Profile
                    </button>
                    <button className="dropdown-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                      Settings
                    </button>
                    <button className="dropdown-item logout" onClick={handleLogout}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                      </svg>
                      Log Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="avatar-wrapper offline">
                <img
                  src={emptypfp}
                  alt="Empty Profile"
                  className="avatar-img"
                />
                <div className="status-ring"></div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
