const path = require('path');
const fs = require('fs');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const packageJson = require('./package.json');

// Dynamically create entries for server and plugins
const entries = {
  'server': './src/index.ts', // Main server entry
};

// Add server plugins as separate entries
const pluginsDir = path.resolve(__dirname, 'src/plugins');
const pluginFiles = fs.readdirSync(pluginsDir).filter(file =>
  file.endsWith('.ts') && !file.includes('-client') && file !== 'types'
);

pluginFiles.forEach(file => {
  const name = path.basename(file, '.ts');
  entries[`plugins/${name}`] = `./src/plugins/${file}`;
});

module.exports = {
  mode: 'production',
  entry: entries,
  target: 'node',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: (chunkData) => {
      // Main server file goes to server/ directory
      if (chunkData.chunk.name === 'server') {
        return `server/kiama-server-${packageJson.version}.js`;
      }
      // Plugins go to server/plugins/ directory
      return `server/[name].js`;
    },
    path: path.resolve(__dirname, '../../dist'),
    library: {
      type: 'commonjs2',
    },
  },
  externals: {
    // Bundle everything for simplicity
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'src/plugins'),
          to: path.resolve(__dirname, '../../dist/client/plugins'),
          filter: (filepath) => {
            const filename = path.basename(filepath);
            return filename.endsWith('-client.js') || filename.endsWith('-client.ts');
          },
          transform: (content, filepath) => {
            // For TypeScript client plugins, we might need to compile them
            if (filepath.endsWith('.ts')) {
              // For now, just copy as-is. In production, you might want to compile TS to JS
              return content;
            }
            return content;
          }
        }
      ]
    })
  ]
};