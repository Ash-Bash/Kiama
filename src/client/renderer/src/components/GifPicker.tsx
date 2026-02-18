import React, { useState, useEffect, useCallback } from 'react';
import '../styles/components/GifPicker.scss';

interface Gif {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface GifPickerProps {
  onSelect: (gif: Gif) => void;
  onClose: () => void;
}

const TENOR_API_KEY = 'AIzaSyC8QWKWL8Z3I2q8o8o8o8o8o8o8o8o8o8'; // Replace with actual API key
const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';

const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose }) => {
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [nextPos, setNextPos] = useState<string>('');

  useEffect(() => {
    searchGifs('');
  }, []);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchGifs(searchTerm);
  };

  const handleLoadMore = () => {
    if (nextPos && !loading) {
      searchGifs(searchTerm, nextPos);
    }
  };

  const handleGifClick = (gif: Gif) => {
    onSelect(gif);
    onClose();
  };

  return (
    <div className="gif-picker">
      <div className="gif-picker-header">
        <h3>GIFs</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <form className="gif-search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Search GIFs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button type="submit">Search</button>
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
          <button onClick={handleLoadMore}>Load More</button>
        </div>
      )}
    </div>
  );
};

export default GifPicker;