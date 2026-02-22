import React from 'react';
import '../styles/components/_titleBar.scss';

declare const window: any;
const { ipcRenderer } = window.require('electron');

// Cross-platform title bar that proxies window controls via IPC.
const TitleBar: React.FC = () => {
  const isMac = process.platform === 'darwin';

  // Forward window control commands to the Electron main process.
  const sendWindowControl = (action: 'minimize' | 'maximize' | 'close') => {
    ipcRenderer.send('window-control', action);
  };

  // Individual button click handlers forward to IPC helper.
  const handleMinimize = () => sendWindowControl('minimize');
  const handleMaximize = () => sendWindowControl('maximize');
  const handleClose = () => sendWindowControl('close');

  if (isMac) {
    return (
      <div className="title-bar mac">
        <div className="title">Kiama</div>
      </div>
    );
  } else {
    return (
      <div className="title-bar windows">
        <div className="title">Kiama</div>
        <div className="window-controls">
          <button className="control minimize" onClick={handleMinimize}>─</button>
          <button className="control maximize" onClick={handleMaximize}>□</button>
          <button className="control close" onClick={handleClose}>×</button>
        </div>
      </div>
    );
  }
};

export default TitleBar;