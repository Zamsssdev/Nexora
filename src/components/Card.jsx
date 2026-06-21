import React, { useState } from 'react';
import './Card.css';

export default function Card({ game, inLibrary: propInLibrary, onLibraryToggle, onClick, hideActions }) {
  const [internalInLibrary, setInternalInLibrary] = useState(game.inLibrary || false);
  const [imgError, setImgError]   = useState(false);

  const isLockedInLibrary = propInLibrary !== undefined ? propInLibrary : internalInLibrary;

  const handleLibraryToggle = (e) => {
    e.stopPropagation();
    if (onLibraryToggle) {
      onLibraryToggle(game);
    } else {
      setInternalInLibrary((prev) => !prev);
    }
  };

  // Format owner count for display
  const formatOwners = (owners) => {
    if (!owners) return null;
    const parts = String(owners).split('..');
    const upper = parts[parts.length - 1].trim().replace(/,/g, '').trim();
    const num = parseInt(upper);
    if (isNaN(num)) return null;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M owners`;
    if (num >= 1_000)     return `${(num / 1_000).toFixed(0)}K owners`;
    return `${num} owners`;
  };

  const ownersText = formatOwners(game.owners);

  return (
    <div className="game-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="game-card-cover">
        {game.imageUrl && !imgError ? (
          <img
            src={game.imageUrl}
            alt={game.title}
            className="game-card-img"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="game-card-image" style={{ background: game.gradient || 'linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)' }}>
            <div className="game-card-overlay-title">{game.title}</div>
          </div>
        )}
        <div className="game-card-shine" />
      </div>

      <div className="game-card-info">
        <h3 className="game-card-title">{game.title}</h3>
        {ownersText && <p className="game-card-date">{ownersText}</p>}
        {!hideActions && (
          <div className="game-card-actions">
            <button
              className={`game-card-btn ${isLockedInLibrary ? 'in-library' : ''}`}
              onClick={handleLibraryToggle}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {isLockedInLibrary
                  ? <polyline points="20 6 9 17 4 12" />
                  : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
                }
              </svg>
              {isLockedInLibrary ? 'In Library' : 'Add to Library'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
