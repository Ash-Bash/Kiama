"use strict";
/*
PLUGIN_METADATA
{
  "name": "Poll Plugin",
  "version": "1.0.0",
  "checksum": "366c3d28039e6d96bb097bc3e4d9d85d19040aacd58cf0c925ffa8751423e219",
  "permissions": {
    "messageHandler": false,
    "routeHandler": false,
    "fileSystem": false,
    "network": false,
    "database": false
  },
  "author": "KIAMA Team",
  "description": "Provides poll functionality for the chat server"
}
*/
Object.defineProperty(exports, "__esModule", { value: true });
// Server-side poll plugin that registers the client renderer metadata.
const pollPlugin = {
    name: 'Poll Plugin',
    version: '1.0.0',
    init: (api) => {
        // Register client plugin for poll message type
        const pollClientPlugin = {
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
exports.default = pollPlugin;
