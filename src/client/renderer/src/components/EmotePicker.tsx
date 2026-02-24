import React, { useState, useEffect } from 'react';
import PopoverPanel, { PopoverAnchorRect } from './PopoverPanel';
import '../styles/components/EmotePicker.scss';

interface Emote {
  name: string;
  url: string;
  unicode?: string;
  serverId?: string;
  serverName?: string;
}

// Re-export so existing callers using `import { AnchorRect } from './EmotePicker'`
// keep working without changes.
export type { PopoverAnchorRect as AnchorRect };

interface EmotePickerProps {
  onSelect: (emote: Emote) => void;
  onClose: () => void;
  servers: Array<{ id: string; name: string; url: string }>;
  /** When provided the picker floats as a fixed popover anchored to this rect */
  anchorRect?: PopoverAnchorRect | null;
}

// Consolidated emoji/emote picker that pulls assets from all connected servers.
const EmotePicker: React.FC<EmotePickerProps> = ({ onSelect, onClose, servers, anchorRect }) => {
  const [emotes, setEmotes] = useState<Emote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<string>('all');

  // Built-in system emoji set (Unicode)
  const BUILT_IN_EMOJIS: Emote[] = [
    { name: 'grinning', url: '', unicode: '😀' },
    { name: 'smiley', url: '', unicode: '😃' },
    { name: 'smile', url: '', unicode: '😄' },
    { name: 'grin', url: '', unicode: '😁' },
    { name: 'laughing', url: '', unicode: '😆' },
    { name: 'sweat_smile', url: '', unicode: '😅' },
    { name: 'joy', url: '', unicode: '😂' },
    { name: 'rofl', url: '', unicode: '🤣' },
    { name: 'slight_smile', url: '', unicode: '🙂' },
    { name: 'wink', url: '', unicode: '😉' },
    { name: 'blush', url: '', unicode: '😊' },
    { name: 'yum', url: '', unicode: '😋' },
    { name: 'sunglasses', url: '', unicode: '😎' },
    { name: 'heart_eyes', url: '', unicode: '😍' },
    { name: 'kissing_heart', url: '', unicode: '😘' },
    { name: 'kissing', url: '', unicode: '😗' },
    { name: 'kissing_smiling_eyes', url: '', unicode: '😙' },
    { name: 'kissing_closed_eyes', url: '', unicode: '😚' },
    { name: 'hugging', url: '', unicode: '🤗' },
    { name: 'thinking', url: '', unicode: '🤔' },
    { name: 'neutral_face', url: '', unicode: '😐' },
    { name: 'expressionless', url: '', unicode: '😑' },
    { name: 'no_mouth', url: '', unicode: '😶' },
    { name: 'zipper_mouth', url: '', unicode: '🤐' },
    { name: 'face_with_raised_eyebrow', url: '', unicode: '🤨' },
    { name: 'monocle', url: '', unicode: '🧐' },
    { name: 'relieved', url: '', unicode: '😌' },
    { name: 'sleeping', url: '', unicode: '😴' },
    { name: 'smirk', url: '', unicode: '😏' },
    { name: 'unamused', url: '', unicode: '😒' },
    { name: 'roll_eyes', url: '', unicode: '🙄' },
    { name: 'grimacing', url: '', unicode: '😬' },
    { name: 'lying_face', url: '', unicode: '🤥' },
    { name: 'shushing', url: '', unicode: '🤫' },
    { name: 'exploding_head', url: '', unicode: '🤯' },
    { name: 'sob', url: '', unicode: '😭' },
    { name: 'cry', url: '', unicode: '😢' },
    { name: 'disappointed', url: '', unicode: '😞' },
    { name: 'pensive', url: '', unicode: '😔' },
    { name: 'confused', url: '', unicode: '😕' },
    { name: 'slight_frown', url: '', unicode: '🙁' },
    { name: 'frowning2', url: '', unicode: '☹️' },
    { name: 'persevere', url: '', unicode: '😣' },
    { name: 'triumph', url: '', unicode: '😤' },
    { name: 'angry', url: '', unicode: '😠' },
    { name: 'rage', url: '', unicode: '😡' },
    { name: 'poop', url: '', unicode: '💩' },
    { name: 'clown', url: '', unicode: '🤡' },
    { name: 'ghost', url: '', unicode: '👻' },
    { name: 'robot', url: '', unicode: '🤖' },
    { name: 'skull', url: '', unicode: '💀' },
    { name: 'heart', url: '', unicode: '❤️' },
    { name: 'orange_heart', url: '', unicode: '🧡' },
    { name: 'yellow_heart', url: '', unicode: '💛' },
    { name: 'green_heart', url: '', unicode: '💚' },
    { name: 'blue_heart', url: '', unicode: '💙' },
    { name: 'purple_heart', url: '', unicode: '💜' },
    { name: 'black_heart', url: '', unicode: '🖤' },
    { name: 'white_heart', url: '', unicode: '🤍' },
    { name: 'thumbsup', url: '', unicode: '👍' },
    { name: 'thumbsdown', url: '', unicode: '👎' },
    { name: 'wave', url: '', unicode: '👋' },
    { name: 'pray', url: '', unicode: '🙏' },
    { name: 'fire', url: '', unicode: '🔥' },
    { name: '100', url: '', unicode: '💯' },
    { name: 'star', url: '', unicode: '⭐' },
    { name: 'sparkles', url: '', unicode: '✨' },
    { name: 'tada', url: '', unicode: '🎉' },
    { name: 'balloon', url: '', unicode: '🎈' },
    { name: 'eyes', url: '', unicode: '👀' },
    { name: 'coffee', url: '', unicode: '☕' },
    { name: 'beer', url: '', unicode: '🍺' },
    { name: 'pizza', url: '', unicode: '🍕' },
    { name: 'cake', url: '', unicode: '🍰' },
    { name: 'cookie', url: '', unicode: '🍪' }
  ];

  useEffect(() => {
    fetchEmotes();
  }, [selectedServer]);

  // Retrieve emote catalogs from configured servers and merge with built-ins.
  const fetchEmotes = async () => {
    setLoading(true);
    try {
      // Start with built-in system emojis
      const allEmotes: Emote[] = [...BUILT_IN_EMOJIS];

      if (selectedServer === 'builtin') {
        setEmotes(BUILT_IN_EMOJIS);
        return;
      }

      if (selectedServer === 'all') {
        // Fetch from all servers
        for (const server of servers) {
          try {
            const response = await fetch(`${server.url}/emotes-list`);
            if (response.ok) {
              const serverEmotes = await response.json();
              allEmotes.push(...serverEmotes.map((e: any) => ({
                ...e,
                serverId: server.id,
                serverName: server.name,
                url: `${server.url}${e.url}`
              })));
            }
          } catch (error) {
            console.error(`Failed to fetch emotes from ${server.name}:`, error);
          }
        }
      } else {
        // Fetch from specific server
        const server = servers.find(s => s.id === selectedServer);
        if (server) {
          const response = await fetch(`${server.url}/emotes-list`);
          if (response.ok) {
            const serverEmotes = await response.json();
            allEmotes.push(...serverEmotes.map((e: any) => ({
              ...e,
              serverId: server.id,
              serverName: server.name,
              url: `${server.url}${e.url}`
            })));
          }
        }
      }

      setEmotes(allEmotes);
    } catch (error) {
      console.error('Failed to fetch emotes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Forward the selected emote to the composer then close the picker.
  const handleEmoteClick = (emote: Emote) => {
    onSelect(emote);
    onClose();
  };

  return (
    <PopoverPanel
      title="Emotes"
      onClose={onClose}
      width={360}
      height={380}
      anchorRect={anchorRect}
      className="emote-picker"
    >
      <div className="server-tabs">
        <button
          className={selectedServer === 'all' ? 'active' : ''}
          onClick={() => setSelectedServer('all')}
        >
          All
        </button>
        <button
          className={selectedServer === 'builtin' ? 'active' : ''}
          onClick={() => setSelectedServer('builtin')}
        >
          Emoji
        </button>
        {servers.map(server => (
          <button
            key={server.id}
            className={selectedServer === server.id ? 'active' : ''}
            onClick={() => setSelectedServer(server.id)}
          >
            {server.name}
          </button>
        ))}
      </div>

      <div className="emote-grid">
        {loading ? (
          <div className="loading">Loading emotes...</div>
        ) : emotes.length === 0 ? (
          <div className="no-emotes">No emotes available</div>
        ) : (
          emotes.map((emote, index) => (
            <button
              key={`${emote.serverId}-${emote.name}-${index}`}
              className="emote-btn"
              onClick={() => handleEmoteClick(emote)}
              title={`${emote.name}${emote.serverName ? ` (${emote.serverName})` : ''}`}
            >
              {emote.unicode ? (
                <span className="emoji-char">{emote.unicode}</span>
              ) : (
                <img src={emote.url} alt={emote.name} />
              )}
            </button>
          ))
        )}
      </div>
    </PopoverPanel>
  );
};

export default EmotePicker;