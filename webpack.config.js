const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
    entry: './webpage/index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist')
    },
    module: {
        rules: [
            {
                test: /\.vue$/,
                use: 'vue-loader'
            },
            {
                test: /\.css$/,
                use: [
                    'vue-style-loader',
                    {
                        loader: 'css-loader',
                    }
                ]
            }
        ]
    },
    plugins: [
        new VueLoaderPlugin()
    ]
}
