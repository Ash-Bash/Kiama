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
  messageListRef?: React.RefObject<HTMLDivElement>;
  channelsLoading?: boolean;
  canSend?: boolean;
  cooldownExpiry?: number; // timestamp ms when cooldown expires
  onOpenPinnedMessages?: (anchorRect?: { top: number; left: number; width: number; height: number } | null) => void;
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
  messageListRef,
  cooldownExpiry,
  canSend,
  channelsLoading,
  onOpenPinnedMessages,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [remainingSeconds, setRemainingSeconds] = React.useState<number>(0);

  React.useEffect(() => {
    const compute = () => {
      const now = Date.now();
      if (cooldownExpiry && cooldownExpiry > now) {
        setRemainingSeconds(Math.ceil((cooldownExpiry - now) / 1000));
      } else {
        setRemainingSeconds(0);
      }
    };
    compute();
    const id = setInterval(compute, 500);
    return () => clearInterval(id);
  }, [cooldownExpiry]);

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
          {/* Right-side channel controls (pins, members) */}
          <div className="channel-header-controls">
            {(currentChannel && (currentChannel.settings?.allowPinning ?? true)) && (
              <button
                className="channel-pins-btn"
                title="Pinned Messages"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  if (typeof onOpenPinnedMessages === 'function') onOpenPinnedMessages({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                }}
              >
                <i className="fas fa-thumbtack" />
                {currentMessages && currentMessages.filter(m => (m as any).pinned).length > 0 && (
                  <span className="channel-pins-count">{currentMessages.filter(m => (m as any).pinned).length}</span>
                )}
              </button>
            )}
          </div>
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
        <div className="message-list" ref={messageListRef}>
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

            {/* Composer area: compact wrapper to control spacing between slow-mode indicator and input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -6, marginBottom: 8 }}>
              {(currentChannel?.settings?.slowMode ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 8px' }}>
                  {remainingSeconds > 0 ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                      <i className="far fa-clock" aria-hidden style={{ fontSize: 14 }} />
                      <span>{remainingSeconds}s</span>
                    </div>
                  ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                      <i className="far fa-clock" aria-hidden style={{ fontSize: 13 }} />
                      <span>Slow mode is enabled</span>
                    </div>
                  )}
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
                onKeyPress={(e) => e.key === 'Enter' && (!(remainingSeconds && remainingSeconds > 0) ? onSendMessage() : null)}
                placeholder={`Message #${currentChannel?.name || 'general'}`}
                disabled={!!(remainingSeconds && remainingSeconds > 0)}
              />
              <div className="message-function-tray">
                <button className="tray-btn emote-btn" onClick={(e) => openEmojiPicker(e.currentTarget.getBoundingClientRect())} title="Add Emoji">
                  <i className="far fa-smile"></i>
                </button>
                <button className="tray-btn gif-btn" onClick={() => openGifPicker()} title="Add GIF">
                  <i className="fas fa-film"></i>
                </button>
              </div>
              <button className="send-btn" onClick={() => { if (!(remainingSeconds && remainingSeconds > 0)) onSendMessage(); }} title="Send Message" disabled={!!(remainingSeconds && remainingSeconds > 0)}>
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
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
