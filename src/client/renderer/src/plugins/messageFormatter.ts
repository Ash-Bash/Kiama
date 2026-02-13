import { ClientPlugin } from '../types/plugin';

const messageFormatterPlugin: ClientPlugin = {
  name: 'Message Formatter',
  version: '1.0.0',
  init: (api) => {
    console.log('Message Formatter plugin initialized');

    // Add message handler to format messages with basic markdown-like syntax
    api.addMessageHandler((message) => {
      // Simple bold formatting: **text** -> <strong>text</strong>
      message.content = message.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Simple italic formatting: *text* -> <em>text</em>
      message.content = message.content.replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

      return message;
    });
  }
};

export default messageFormatterPlugin;