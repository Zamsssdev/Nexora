import React, { useState, useMemo, useEffect } from 'react';
import './Home.css';
import Card from './Card';

// Try to access ipcRenderer when running inside Electron renderer
let ipcRenderer = null;
try {
  // Prefer window.require when bundled by Vite or similar.
  if (typeof window !== 'undefined' && window && window.process && window.process.versions && window.process.versions.electron && typeof window.require === 'function') {
    // eslint-disable-next-line import/no-extraneous-dependencies
    ipcRenderer = window.require('electron').ipcRenderer;
  } else if (typeof require === 'function') {
    // Fallback for non-bundled contexts (dev with nodeIntegration)
    // eslint-disable-next-line import/no-extraneous-dependencies
    ipcRenderer = require('electron').ipcRenderer;
  }
} catch (e) {
  ipcRenderer = null;
}

// CORS proxies – tries first, falls back to second
const STEAMSPY_API = 'https://steamspy.com/api.php?request=all&page=0';
const PROXY_1 = `https://corsproxy.io/?url=${encodeURIComponent(STEAMSPY_API)}`;
const PROXY_2 = `https://api.allorigins.win/get?url=${encodeURIComponent(STEAMSPY_API)}`;

// Steam CDN cover image (portrait)
const steamImg = (appid) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;

const SORT_OPTIONS = [
  { label: 'Popularity', value: 'popular' },
  { label: 'A → Z',      value: 'az' },
  { label: 'Z → A',      value: 'za' },
  { label: 'Most Owners', value: 'owners' },
];

export default function Home({ library, toggleLibrary }) {
  const [games, setGames]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [sortBy, setSortBy]     = useState('popular');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const currentSort = SORT_OPTIONS.find((o) => o.value === sortBy);

  // ---- Fetch from SteamSpy ----
  useEffect(() => {
    const controller = new AbortController();

    async function fetchGames() {
      try {
        setLoading(true);
        setError(null);

        let data = null;

        // If running inside Electron renderer, ask main process to fetch (no CORS)
        if (ipcRenderer && ipcRenderer.invoke) {
          try {
            console.log('Invoking main fetch-steamspy-top100 via IPC');
            const resp = await ipcRenderer.invoke('fetch-steamspy-top100');
            console.log('IPC response:', resp);
            if (resp && resp.ok) {
              data = resp.data;
            } else {
              console.error('Main fetch failed, falling back to proxies:', resp && resp.error);
            }
          } catch (e) {
            console.error('IPC fetch failed, falling back to proxies:', e && e.message);
          }
        } else {
          console.log('ipcRenderer not available in renderer; will use proxy fallbacks');
        }

        // Fallback: try proxy 1 (corsproxy.io)
        if (!data) {
          try {
            const res = await fetch(PROXY_1, { signal: controller.signal });
            if (!res.ok) throw new Error(`proxy1 HTTP ${res.status}`);
            data = await res.json();
          } catch (e1) {
            if (e1.name === 'AbortError') throw e1;
            console.warn('Proxy 1 failed, trying proxy 2...', e1.message);

            // Try proxy 2 (allorigins – wraps in { contents: "..." })
            const res2 = await fetch(PROXY_2, { signal: controller.signal });
            if (!res2.ok) throw new Error(`proxy2 HTTP ${res2.status}`);
            const wrapper = await res2.json();
            data = JSON.parse(wrapper.contents);
          }
        }

        if (!data || typeof data !== 'object') throw new Error('Invalid data');

        const list = Object.entries(data).map(([appid, info]) => ({
          id: appid,
          appid: Number(appid),
          title: info.name,
          owners: info.owners,
          positive: info.positive,
          negative: info.negative,
          peak_ccu: info.ccu,
          imageUrl: steamImg(appid),
          inLibrary: false,
        }));

        setGames(list);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(`Gagal memuat data: ${err.message}`);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchGames();
    return () => controller.abort();
  }, []);

  // ---- Fetch Search Results Dynamically from Steam Store ----
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        let list = [];
        if (ipcRenderer && ipcRenderer.invoke) {
          const resp = await ipcRenderer.invoke('search-steam-store', search);
          if (resp && resp.ok && resp.data && resp.data.items) {
            list = resp.data.items.map(item => ({
              id: String(item.id),
              appid: Number(item.id),
              title: item.name,
              owners: 'N/A',
              positive: 0,
              negative: 0,
              peak_ccu: 0,
              imageUrl: steamImg(item.id),
              inLibrary: false,
            }));
          }
        } else {
          // Fallback: try proxying steam storesearch
          const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(search)}&l=english&cc=US`;
          const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
          const res = await fetch(proxyUrl);
          if (res.ok) {
            const data = await res.json();
            if (data && data.items) {
              list = data.items.map(item => ({
                id: String(item.id),
                appid: Number(item.id),
                title: item.name,
                owners: 'N/A',
                positive: 0,
                negative: 0,
                peak_ccu: 0,
                imageUrl: steamImg(item.id),
                inLibrary: false,
              }));
            }
          }
        }
        setSearchResults(list);
      } catch (err) {
        console.error('Failed to search Steam Store:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // ---- Filter + Sort ----
  const filteredGames = useMemo(() => {
    let list = search.trim() ? [...searchResults] : [...games];

    switch (sortBy) {
      case 'popular': /* keep original rank order */ break;
      case 'az':      list.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'za':      list.sort((a, b) => b.title.localeCompare(a.title)); break;
      case 'owners':
        list.sort((a, b) => {
          const parse = (s) => parseInt((s || '0').replace(/,|\s/g, '').split('..')[1] || '0');
          return parse(b.owners) - parse(a.owners);
        });
        break;
    }

    return list;
  }, [games, searchResults, search, sortBy]);

  return (
    <div className="home-container">
      {/* Breadcrumb */}
      <div className="home-breadcrumb">
        <span className="breadcrumb-root">Games List</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        <span className="breadcrumb-current">Top 1000 Games</span>
      </div>

      {/* Title */}
      <h1 className="home-title">Games List</h1>

      {/* Toolbar */}
      <div className="home-toolbar">
        {/* Sort */}
        <div className="sort-dropdown" onMouseLeave={() => setSortOpen(false)}>
          <button className="sort-btn" onClick={() => setSortOpen((v) => !v)} id="sort-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
            Sort by
            <span className="sort-label">{currentSort.label}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {sortOpen && (
            <div className="sort-menu">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`sort-menu-item ${sortBy === opt.value ? 'active' : ''}`}
                  onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                >
                  {opt.label}
                  {sortBy === opt.value && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="home-search-wrapper">
          <svg className="home-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            id="home-search-input"
            className="home-search-input"
            type="text"
            placeholder="Search games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="home-search-clear" onClick={() => setSearch('')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* States */}
      {(loading || isSearching) && (
        <div className="home-loading">
          <div className="home-spinner" />
          <p>{isSearching ? 'Searching all Steam games...' : 'Fetching games from Steam...'}</p>
        </div>
      )}

      {error && !loading && (
        <div className="home-error">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <p>{error}</p>
          <button className="home-retry-btn" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {!loading && !isSearching && !error && filteredGames.length > 0 && (
        <div className="home-grid">
          {filteredGames.map((game) => {
            const isAdded = library.some((g) => g.id === game.id);
            return (
              <Card
                key={game.id}
                game={game}
                inLibrary={isAdded}
                onLibraryToggle={toggleLibrary}
              />
            );
          })}
        </div>
      )}

      {!loading && !isSearching && !error && filteredGames.length === 0 && (
        <div className="home-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <p>No games found for "<strong>{search}</strong>"</p>
        </div>
      )}
    </div>
  );
}
