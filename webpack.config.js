const { resolve } = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { BannerPlugin } = require('webpack');

const isProd = process.env.NODE_ENV === 'production';
const SANDBOX_SUFFIX = '-sandbox';

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: { index: './src/widgets/index.tsx', 'index-sandbox': './src/widgets/index.tsx' },
  output: {
    path: resolve(__dirname, 'dist'),
    filename: '[name].js',
    publicPath: ''
  },
  resolve: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|jsx|js)?$/,
        loader: 'esbuild-loader',
        options: { loader: 'tsx', target: 'es2020', minify: false }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      templateContent: `
<body></body>
<script type="text/javascript">
const urlSearchParams = new URLSearchParams(window.location.search);
const queryParams = Object.fromEntries(urlSearchParams.entries());
const widgetName = queryParams["widgetName"];
if (widgetName == undefined) { document.body.innerHTML += "Widget ID not specified."; }
const s = document.createElement('script');
s.type = "module";
s.src = widgetName + "${SANDBOX_SUFFIX}.js";
document.body.appendChild(s);
</script>`,
      filename: 'index.html',
      inject: false
    }),
    new BannerPlugin({
      banner: (file) => !file.chunk.name.includes(SANDBOX_SUFFIX) ? 'const IMPORT_META=import.meta;' : '',
      raw: true
    }),
    new CopyPlugin({ patterns: [{ from: 'public', to: '' }, { from: 'README.md', to: '' }] })
  ],
  devServer: isProd ? undefined : {
    port: 8080,
    open: true,
    hot: true,
    compress: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'baggage, sentry-trace'
    }
  }
};
