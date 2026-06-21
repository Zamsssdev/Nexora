import React, { useState, useMemo } from 'react';
import './Home.css'; // Reuses Home page css for identical look & feel
import Card from './Card';

const SORT_OPTIONS = [
  { label: 'Popularity', value: 'popular' },
  { label: 'A → Z',      value: 'az' },
  { label: 'Z → A',      value: 'za' },
  { label: 'Most Owners', value: 'owners' },
];

export default function Library({ library, toggleLibrary }) {
  const [search, setSearch]     = useState('');
  const [sortBy, setSortBy]     = useState('popular');
  const [sortOpen, setSortOpen] = useState(false);

  const currentSort = SORT_OPTIONS.find((o) => o.value === sortBy);

  // ---- Filter + Sort ----
  const filteredGames = useMemo(() => {
    let list = [...library];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((g) => g.title.toLowerCase().includes(q));
    }

    switch (sortBy) {
      case 'popular': /* original order of addition */ break;
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
  }, [library, search, sortBy]);

  return (
    <div className="home-container">
      {/* Breadcrumb */}
      <div className="home-breadcrumb">
        <span className="breadcrumb-root">My Library</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        <span className="breadcrumb-current">List</span>
      </div>

      {/* Title */}
      <h1 className="home-title">My Library</h1>

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
            placeholder="Search library..."
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

      {/* Grid */}
      {filteredGames.length > 0 ? (
        <div className="home-grid">
          {filteredGames.map((game) => (
            <Card
              key={game.id}
              game={game}
              inLibrary={true}
              onLibraryToggle={toggleLibrary}
            />
          ))}
        </div>
      ) : (
        <div className="home-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <p>
            {search
              ? `No games found in your library for "${search}"`
              : "Your library is empty. Go to Home to add games!"}
          </p>
        </div>
      )}
    </div>
  );
}
