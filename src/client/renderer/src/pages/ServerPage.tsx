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

interface ServerPageProps {
  showMobileNavButtons: boolean;
  onToggleNavPanels: () => void;
  onToggleMembers: () => void;
  currentChannel?: Channel;
  currentMessages: TypedMessage[];
  renderMessage: (msg: TypedMessage) => React.ReactNode;
  message: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  showMessageOptions: boolean;
  onToggleMessageOptions: () => void;
  openEmojiPicker: () => void;
  openGifPicker: () => void;
  closeEmotePicker: () => void;
  closeGifPicker: () => void;
  showEmotePicker: boolean;
  showGifPicker: boolean;
  handleEmoteSelect: (emote: { name: string; unicode?: string }) => void;
  handleGifSelect: (gif: { url: string; title: string }) => void;
  handleImageUpload: () => void;
  handleFileUpload: () => void;
  sendPollMessage: () => void;
  servers: Server[];
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
        {currentMessages.map(renderMessage)}
      </div>

      <div className="message-input">
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
            <button className="tray-btn emote-btn" onClick={openEmojiPicker} title="Add Emoji">
              <i className="far fa-smile"></i>
            </button>
            <button className="tray-btn gif-btn" onClick={openGifPicker} title="Add GIF">
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
          />
        )}

        {showGifPicker && (
          <GifPicker
            onSelect={handleGifSelect}
            onClose={closeGifPicker}
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
