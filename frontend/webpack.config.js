const { VueLoaderPlugin } = require("vue-loader");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

const isProd = (process.env.NODE_ENV === 'production');

module.exports = {
    mode: isProd ? 'production' : 'development',
    entry: './src/main.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.[contenthash].js',
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    // 'defaults' targets browsers that match the >0.5%, not dead,
                    // not op_mini all browserslist preset — well above what
                    // window.crypto.subtle + Argon2 WASM need. IE 11 target removed.
                    options: { presets: [['@babel/preset-env', { targets: 'defaults' }]] },
                },
            },
            { test: /\.vue$/, loader: "vue-loader" },
            { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        ],
    },
    plugins: [
        new VueLoaderPlugin(),
        new HtmlWebpackPlugin({
            template: "public/index.html",
            inject: true,
            minify: isProd,
            hash: true,
        }),
    ],
    devServer: {
        // Local dev: backend runs on :3000 directly; webpack-dev-server proxies
        // /api/* through so the SPA can call its own origin in development too.
        proxy: [
            { context: ['/api'], target: 'http://localhost:3000', changeOrigin: true },
        ],
    },
    resolve: {
        extensions: [".js", ".vue"],
    },
};
