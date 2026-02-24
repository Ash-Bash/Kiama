import React, { useState, useEffect, useCallback } from 'react';
import PopoverPanel, { PopoverAnchorRect } from './PopoverPanel';
import Button from './Button';
import TextField from './TextField';
import '../styles/components/GifPicker.scss';

interface Gif {
  id: string;
  url: string;
  preview: string;
  title: string;
}

// Re-export so existing callers using `import { GifAnchorRect } from './GifPicker'`
// keep working without changes.
export type { PopoverAnchorRect as GifAnchorRect };

interface GifPickerProps {
  onSelect: (gif: Gif) => void;
  onClose: () => void;
  /** When provided the picker floats as a fixed popover anchored to this rect */
  anchorRect?: PopoverAnchorRect | null;
}

const TENOR_API_KEY = 'AIzaSyC8QWKWL8Z3I2q8o8o8o8o8o8o8o8o8o8'; // Replace with actual API key
const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';

// Tenor-backed GIF picker with pagination support.
const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose, anchorRect }) => {
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [nextPos, setNextPos] = useState<string>('');

  useEffect(() => {
    searchGifs('');
  }, []);

  // Query Tenor for GIFs, optionally resuming at a pagination cursor.
  const searchGifs = useCallback(async (query: string, pos: string = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        key: TENOR_API_KEY,
        q: query || 'trending',
        limit: '20',
        pos: pos,
        media_filter: 'gif,tinygif'
      });

      const response = await fetch(`${TENOR_BASE_URL}/search?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch GIFs');
      }

      const data = await response.json();
      const newGifs = data.results.map((result: any) => ({
        id: result.id,
        url: result.media_formats.gif.url,
        preview: result.media_formats.tinygif.url,
        title: result.title
      }));

      if (pos) {
        setGifs(prev => [...prev, ...newGifs]);
      } else {
        setGifs(newGifs);
      }

      setNextPos(data.next);
    } catch (error) {
      console.error('Failed to search GIFs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Start a new search with the given keyword.
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchGifs(searchTerm);
  };

  // Request the next page of GIFs from Tenor when available.
  const handleLoadMore = () => {
    if (nextPos && !loading) {
      searchGifs(searchTerm, nextPos);
    }
  };

  // Select a GIF and close the picker overlay.
  const handleGifClick = (gif: Gif) => {
    onSelect(gif);
    onClose();
  };

  return (
    <PopoverPanel
      title="GIFs"
      onClose={onClose}
      width={400}
      height={500}
      anchorRect={anchorRect}
      className="gif-picker"
    >
      <form className="gif-search" onSubmit={handleSearch}>
        <TextField
          placeholder="Search GIFs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          containerClassName="gif-search-field"
        />
        <Button variant="primary" size="sm" type="submit">Search</Button>
      </form>

      <div className="gif-grid">
        {gifs.map((gif) => (
          <button
            key={gif.id}
            className="gif-btn"
            onClick={() => handleGifClick(gif)}
            title={gif.title}
          >
            <img src={gif.preview} alt={gif.title} />
          </button>
        ))}

        {loading && (
          <div className="loading">Loading GIFs...</div>
        )}
      </div>

      {nextPos && !loading && (
        <div className="load-more">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>Load More</Button>
        </div>
      )}
    </PopoverPanel>
  );
};

export default GifPicker;