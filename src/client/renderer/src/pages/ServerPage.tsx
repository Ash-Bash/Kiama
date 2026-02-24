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
}) => {
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
      <div className="message-list">
        {currentMessages.map((msg, i, arr) => renderMessage(msg, i, arr))}
      </div>

      <div className="message-input">
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
