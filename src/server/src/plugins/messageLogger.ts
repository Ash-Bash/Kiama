import { ServerPlugin } from '../types/plugin';

// Server plugin that streams every received message to the server logs for debugging.
const messageLoggerPlugin: ServerPlugin = {
  name: 'message-logger',
  version: '1.0.0',
  description: 'Logs all messages to the console for debugging',
  author: 'Kiama Team',
  permissions: ['read:messages'],
  enabled: true,
  init: (api) => {
    console.log('Message Logger plugin initialized');

    // Register message handler to log all messages
    api.onMessage((message) => {
      console.log(`[MESSAGE LOG] ${new Date().toISOString()} - ${message.author}: ${message.content} (Channel: ${message.channelId})`);
    });
  }
};

export default messageLoggerPlugin;