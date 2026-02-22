const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Webpack config for the Electron renderer that also builds every client plugin entrypoint.

// Dynamically create entries for main app and plugins
const entries = {
  'bundle': './renderer/src/index.tsx', // Main client entry
};

// Add client plugins as separate entries
const pluginsDir = path.resolve(__dirname, 'renderer/src/plugins');
if (fs.existsSync(pluginsDir)) {
  const pluginFiles = fs.readdirSync(pluginsDir).filter(file =>
    file.endsWith('.tsx') || file.endsWith('.ts')
  );

  pluginFiles.forEach(file => {
    const name = path.basename(file, path.extname(file));
    entries[`plugins/${name}`] = `./renderer/src/plugins/${file}`;
  });
}

module.exports = {
  mode: 'development',
  entry: entries,
  target: 'electron-renderer',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.json$/,
        type: 'json',
      },
      {
        test: /\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '../../dist/client'),
    library: {
      type: 'umd',
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './renderer/public/index.html',
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'renderer/src/themes'),
          to: 'themes'
        }
      ]
    }),
  ],
};