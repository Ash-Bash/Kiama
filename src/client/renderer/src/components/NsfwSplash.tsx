import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ModalPanel from './ModalPanel';
import '../styles/App.scss';
import { getPortalContainer } from '../utils/portalRoot';

interface Props {
  channelName: string;
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const NsfwSplash: React.FC<Props> = ({ channelName, visible, onConfirm, onCancel }) => {
  // Render nothing when not visible
  if (!visible) return null;

  try { console.debug('[NSFW] rendering splash for', channelName); } catch (e) { /* ignore */ }

  // When visible, add a class to .main-content so we can blur it without
  // needing the modal overlay to be a child of the main content (avoids
  // clipping/overflow issues). Clean up on unmount/visibility change.
  useEffect(() => {
    const el = document.querySelector('.main-content');
    try { if (el) el.classList.add('nsfw-blur-active'); } catch (e) { /* ignore */ }
    return () => { try { if (el) el.classList.remove('nsfw-blur-active'); } catch (e) { /* ignore */ } };
  }, []);

  const container = getPortalContainer('kiama-popover-root');

  const inner = (
    <div className="nsfw-splash-overlay">
      <div className="nsfw-splash-inner">
        <ModalPanel
          title={`Age-restricted channel: ${channelName}`}
          description="This channel is marked NSFW. You must be 18 or older to view its content."
          icon={<span className="nsfw-splash-icon">🔞</span>}
          tone="default"
          footer={(
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary" onClick={onConfirm}>I am 18+</button>
            </div>
          )}
        >
          <p style={{ margin: 0 }}>By continuing you confirm you are at least 18 years old and agree to view adult content in this channel.</p>
        </ModalPanel>
      </div>
    </div>
  );

  return container ? createPortal(inner, container) : inner;
};

export default NsfwSplash;
