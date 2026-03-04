import React from 'react';
import PopoverPanel, { PopoverAnchorRect } from './PopoverPanel';
import { TypedMessage } from '../types/plugin';
import Button from './Button';

interface Props {
  title?: string;
  anchorRect?: PopoverAnchorRect | null;
  onClose: () => void;
  pinnedMessages: TypedMessage[];
  onJumpToMessage: (id: string) => void;
  onUnpin?: (id: string) => void;
}

const PinnedMessagesPanel: React.FC<Props> = ({
  title = 'Pinned Messages',
  anchorRect = null,
  onClose,
  pinnedMessages,
  onJumpToMessage,
  onUnpin,
}) => {
  return (
    <PopoverPanel
      title={title}
      onClose={onClose}
      anchorRect={anchorRect}
      width={420}
      height={420}
      className="pinned-messages-panel"
    >
      <div style={{ padding: 12 }}>
        {pinnedMessages.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
            There isnt Any Pinned Messages
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pinnedMessages.map(m => (
              <div key={m.id} className="pinned-message-row" style={{ padding: 8, borderRadius: 6, background: 'var(--panel-bg)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.user} <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>{new Date(m.timestamp).toLocaleString()}</span></div>
                  <div style={{ marginTop: 6, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: (m.renderedContent ?? m.content) as string }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Button variant="ghost" size="sm" onClick={() => { onJumpToMessage(m.id); onClose(); }}>Jump</Button>
                  {typeof onUnpin === 'function' && (
                    <Button variant="ghost" size="sm" onClick={() => onUnpin(m.id)} iconLeft={<i className="fas fa-thumbtack" />}>Unpin</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PopoverPanel>
  );
};

export default PinnedMessagesPanel;
