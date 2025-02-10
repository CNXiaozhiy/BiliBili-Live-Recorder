const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/app.ts',
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
  externalsPresets: { node: true },
  externals: [
    nodeExternals({
      allowlist: ["common"]
    })
  ],
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
};