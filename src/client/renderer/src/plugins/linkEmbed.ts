import { ClientPlugin } from '../types/plugin';
import LinkEmbed from '../components/LinkEmbed';

const linkEmbedPlugin: ClientPlugin = {
  name: 'Link Embed',
  version: '1.0.0',
  init: (api) => {
    // Add message handler to detect URLs and add embed
    api.addMessageHandler((message) => {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = message.content.match(urlRegex);
      if (urls) {
        message.embeds = urls.map((url: string) => ({ type: 'link', url, component: LinkEmbed }));
      }
      return message;
    });
  }
};

export default linkEmbedPlugin;