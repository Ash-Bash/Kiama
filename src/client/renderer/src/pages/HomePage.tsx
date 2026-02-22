import React from 'react';
import Button from '../components/Button';
import Page from '../components/Page';

interface Server {
  id: string;
  name: string;
  icon?: string;
  url: string;
}

interface HomePageProps {
  user: any;
  nonHomeServers: Server[];
  currentServerId: string;
  addServer: () => void;
  joinServer: () => void;
  switchServer: (serverId: string) => void;
  openAccountSettings: () => void;
  generateServerInitials: (name: string) => string;
}

// Dashboard-style landing page for the Home server slot.
const HomePage: React.FC<HomePageProps> = ({
  user,
  nonHomeServers,
  currentServerId,
  addServer,
  joinServer,
  switchServer,
  openAccountSettings,
  generateServerInitials,
}) => {
  const recentServers = nonHomeServers.slice(0, 4);

  return (
    <Page className="home-page" bodyClassName="home-wrapper" scroll>
      <div className="home-dashboard">
        <div className="home-hero">
          <div className="eyebrow">Home</div>
          <h1>Welcome back{user?.name ? `, ${user.name}` : ''}</h1>
          <p>Pick a quick action to jump into a server or tune your space.</p>
          <div className="hero-actions">
              <Button variant="primary" onClick={addServer} iconLeft={<i className="fas fa-plus-circle"></i>}>
                Create a server
              </Button>
              <Button variant="secondary" onClick={() => switchServer('test-server')} iconLeft={<i className="fas fa-comments"></i>}>
                Enter Test Server
              </Button>
              <Button variant="secondary" onClick={joinServer} iconLeft={<i className="fas fa-sign-in-alt"></i>}>
                Join with invite
              </Button>
              <Button variant="ghost" onClick={openAccountSettings} iconLeft={<i className="fas fa-user-cog"></i>}>
                Account & theme
              </Button>
          </div>
        </div>

        <div className="home-grid">
          <div className="home-card">
            <div className="card-header">
              <span className="card-title">Quick actions</span>
              <span className="card-subtitle">Do the common things fast.</span>
            </div>
            <div className="action-list">
              <button onClick={addServer}><i className="fas fa-rocket"></i>Create a new server</button>
              <button onClick={joinServer}><i className="fas fa-link"></i>Join with an invite</button>
              <button onClick={openAccountSettings}><i className="fas fa-palette"></i>Personalize theme</button>
            </div>
          </div>

          <div className="home-card">
            <div className="card-header">
              <span className="card-title">Recent servers</span>
              <span className="card-subtitle">Jump back into something familiar.</span>
            </div>
            {recentServers.length === 0 ? (
              <div className="empty-state">No servers yet. Create or join one to get started.</div>
            ) : (
              <div className="server-pills">
                {recentServers.map(server => (
                  <button
                    key={server.id}
                    className={`server-pill ${server.id === currentServerId ? 'active' : ''}`}
                    onClick={() => switchServer(server.id)}
                  >
                    <span className="pill-icon">{generateServerInitials(server.name)}</span>
                    <span className="pill-name">{server.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="home-card span-2">
            <div className="card-header">
              <span className="card-title">What’s new</span>
              <span className="card-subtitle">Lightweight tips and highlights.</span>
            </div>
            <div className="tips-grid">
              <div className="tip">
                <i className="fas fa-moon"></i>
                <div>
                  <strong>Theme toggle</strong>
                  <p>Switch between light and dark from Account & theme.</p>
                </div>
              </div>
              <div className="tip">
                <i className="fas fa-plug"></i>
                <div>
                  <strong>Plugins</strong>
                  <p>Use the message plus button to add polls, GIFs, and more.</p>
                </div>
              </div>
              <div className="tip">
                <i className="fas fa-mobile-alt"></i>
                <div>
                  <strong>Mobile friendly</strong>
                  <p>Use the top-left menu to open servers and channels on small screens.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
};

export default HomePage;
