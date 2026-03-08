import React from 'react';
import PopoverPanel, { PopoverAnchorRect } from '../components/PopoverPanel';
import { TypedMessage } from '../types/plugin';
import Button from '../components/Button';
import '../styles/components/PinnedMessagesPanel.scss';

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
      <div className="pinned-messages-body">
        {pinnedMessages.length === 0 ? (
          <div className="pinned-messages-empty">
            There aren't any pinned messages
          </div>
        ) : (
          <div className="pinned-messages-list">
            {pinnedMessages.map(m => (
              <div key={m.id} className="pinned-message-row">
                <div className="pinned-message-content">
                  <div className="pinned-message-meta">{m.user} <span className="pinned-message-meta__time">{new Date(m.timestamp).toLocaleString()}</span></div>
                  <div className="pinned-message-text" dangerouslySetInnerHTML={{ __html: (m.renderedContent ?? m.content) as string }} />
                </div>
                <div className="pinned-message-actions">
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
