import { ServerPlugin, ClientPluginMetadata } from '../types/plugin';

const pollPlugin: ServerPlugin = {
  name: 'Poll Plugin',
  version: '1.0.0',
  init: (api) => {
    // Register client plugin for poll message type
    const pollClientPlugin: ClientPluginMetadata = {
      name: 'Poll Renderer',
      version: '1.0.0',
      messageTypes: ['poll'],
      downloadUrl: 'http://localhost:3000/plugins/poll-client.js',
      checksum: 'poll-plugin-checksum', // In production, calculate actual checksum
      description: 'Renders interactive polls in chat',
      author: 'KIAMA Team',
      enabled: true // Server-provided plugins are enabled by default
    };

    api.registerClientPlugin(pollClientPlugin);

    console.log('Poll server plugin initialized');
  }
};

export default pollPlugin;