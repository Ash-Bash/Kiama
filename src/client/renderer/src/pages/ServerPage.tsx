import React from 'react';
import Page from '../components/Page';
import EmotePicker from '../components/EmotePicker';
import GifPicker from '../components/GifPicker';
import { Channel, TypedMessage } from '../types/plugin';

interface Server {
  id: string;
  name: string;
  icon?: string;
  url: string;
}

interface PickerEmote {
  name: string;
  url: string;
  unicode?: string;
  serverId?: string;
  serverName?: string;
}

interface PickerGif {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface ReplyReference {
  id: string;
  user: string;
  content: string;
}

interface ServerPageProps {
  showMobileNavButtons: boolean;
  onToggleNavPanels: () => void;
  onToggleMembers: () => void;
  currentChannel?: Channel;
  currentMessages: TypedMessage[];
  renderMessage: (msg: TypedMessage, index?: number, arr?: TypedMessage[]) => React.ReactNode;
  message: string;
  onMessageChange: (val: string) => void;
  onSendMessage: () => void;
  showMessageOptions: boolean;
  onToggleMessageOptions: () => void;
  openEmojiPicker: (anchor?: DOMRect) => void;
  openGifPicker: () => void;
  closeEmotePicker: () => void;
  closeGifPicker: () => void;
  showEmotePicker: boolean;
  showGifPicker: boolean;
  handleEmoteSelect: (emote: PickerEmote) => void;
  handleGifSelect: (gif: PickerGif) => void;
  handleImageUpload: () => void;
  handleFileUpload: () => void;
  sendPollMessage: () => void;
  servers: Server[];
  replyingTo: ReplyReference | null;
  onClearReply: () => void;
  reactToMessageId: string | null;
  onCloseReactionPicker: () => void;
  handleReactionEmoteSelect: (emote: PickerEmote) => void;
  pickerAnchor: { top: number; left: number; width: number; height: number } | null;
  channelsLoading?: boolean;
  canSend?: boolean;
}

// Server view that shows channel header, message list, and composer controls.
const ServerPage: React.FC<ServerPageProps> = ({
  showMobileNavButtons,
  onToggleNavPanels,
  onToggleMembers,
  currentChannel,
  currentMessages,
  renderMessage,
  message,
  onMessageChange,
  onSendMessage,
  showMessageOptions,
  onToggleMessageOptions,
  openEmojiPicker,
  openGifPicker,
  closeEmotePicker,
  closeGifPicker,
  showEmotePicker,
  showGifPicker,
  handleEmoteSelect,
  handleGifSelect,
  handleImageUpload,
  handleFileUpload,
  sendPollMessage,
  servers,
  replyingTo,
  onClearReply,
  reactToMessageId,
  onCloseReactionPicker,
  handleReactionEmoteSelect,
  pickerAnchor,
  canSend,
  channelsLoading,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (replyingTo) {
      // Focus the input when reply mode is entered
      // small timeout ensures DOM is updated
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [replyingTo]);
  return (
    <Page
      className="server-page"
      header={
        <div className="channel-header">
          {showMobileNavButtons && (
            <div className="mobile-nav">
              <button
                className="mobile-nav-btn"
                onClick={onToggleNavPanels}
                aria-label="Open server and channel list"
              >
                <i className="fas fa-bars"></i>
              </button>
            </div>
          )}
          <h3>
            {currentChannel ? (
              <>
                <span className="channel-icon">
                  {currentChannel.type === 'text' && '#'}
                  {currentChannel.type === 'voice' && '🔊'}
                  {currentChannel.type === 'announcement' && '📢'}
                </span>
                {currentChannel.name}
                {/* roles diagnostics removed */}
              </>
            ) : (
              'Select a channel'
            )}
          </h3>
          {showMobileNavButtons && (
            <div className="mobile-nav right">
              <button
                className="mobile-nav-btn"
                onClick={onToggleMembers}
                aria-label="Open member list"
              >
                <i className="fas fa-users"></i>
              </button>
            </div>
          )}
        </div>
      }
    >
      {channelsLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column' }}>
          <div className="spinner" style={{ width: 56, height: 56, marginBottom: 12 }} aria-hidden="true" />
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading channels…</div>
        </div>
      ) : (
        <div className="message-list">
          {currentMessages.map((msg, i, arr) => {
            const current = new Date(msg.timestamp);
            const prev = i > 0 ? arr[i - 1] : null;
            let showDaySeparator = false;
            if (!prev) {
              showDaySeparator = true;
            } else {
              const prevDate = new Date(prev.timestamp);
              const sameDay = current.getFullYear() === prevDate.getFullYear() && current.getMonth() === prevDate.getMonth() && current.getDate() === prevDate.getDate();
              const msInDay = 24 * 60 * 60 * 1000;
              const gap = current.getTime() - prevDate.getTime();
              if (!sameDay || gap > msInDay) showDaySeparator = true;
            }

            const formatHeaderDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

            return (
              <React.Fragment key={msg.id}>
                {showDaySeparator && (
                  <div className="day-separator" aria-hidden>
                    <span className="day-separator-label">{formatHeaderDate(current)}</span>
                  </div>
                )}
                {renderMessage(msg, i, arr)}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div className="message-input">
        {canSend === false ? (
          <div className="message-input-disabled" style={{ padding: 12, textAlign: 'center', color: 'var(--text-secondary)', width: '100%' }}>
            You don't have permission to send messages in this channel.
          </div>
        ) : (
          <>
            {/* Reply bar shown above the composer when replying */}
            {replyingTo && (
              <div className="reply-bar">
                <span className="reply-bar-label">
                  <i className="fas fa-reply reply-bar-icon" />
                  Replying to <strong>{replyingTo.user}</strong>
                </span>
                <span className="reply-bar-preview">
                  {replyingTo.content.length > 60
                    ? replyingTo.content.slice(0, 60) + '…'
                    : replyingTo.content}
                </span>
                <button className="reply-bar-close" onClick={onClearReply} title="Cancel reply">
                  <i className="fas fa-times" />
                </button>
              </div>
            )}

            <div className="message-input-container">
              <button
                className="message-options-btn"
                onClick={onToggleMessageOptions}
                title="Message Options"
              >
                <i className="fas fa-plus"></i>
              </button>
              <input
                ref={inputRef}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
                placeholder={`Message #${currentChannel?.name || 'general'}`}
              />
              <div className="message-function-tray">
                <button className="tray-btn emote-btn" onClick={(e) => openEmojiPicker(e.currentTarget.getBoundingClientRect())} title="Add Emoji">
                  <i className="far fa-smile"></i>
                </button>
                <button className="tray-btn gif-btn" onClick={() => openGifPicker()} title="Add GIF">
                  <i className="fas fa-film"></i>
                </button>
              </div>
              <button className="send-btn" onClick={onSendMessage} title="Send Message">
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
          </>
        )}

        {showEmotePicker && (
          <EmotePicker
            onSelect={handleEmoteSelect}
            onClose={closeEmotePicker}
            servers={servers}
            anchorRect={pickerAnchor}
          />
        )}

        {showGifPicker && (
          <GifPicker
            onSelect={handleGifSelect}
            onClose={closeGifPicker}
          />
        )}

        {/* Reaction emote picker — launched from message hover toolbar */}
        {reactToMessageId && (
          <EmotePicker
            onSelect={handleReactionEmoteSelect}
            onClose={onCloseReactionPicker}
            servers={servers}
            anchorRect={pickerAnchor}
          />
        )}

        {showMessageOptions && (
          <div className="message-options-menu">
            <button onClick={handleImageUpload} title="Upload Image">
              <i className="fas fa-image"></i> Upload Image
            </button>
            <button onClick={handleFileUpload} title="Attach File">
              <i className="fas fa-paperclip"></i> Attach File
            </button>
            <button onClick={sendPollMessage} title="Create Poll">
              <i className="fas fa-chart-bar"></i> Create Poll
            </button>
          </div>
        )}
      </div>
    </Page>
  );
};

export default ServerPage;
