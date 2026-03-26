const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  chainWebpack: (config) => {
    if (process.env.NODE_ENV === "production") {
      config.plugins.delete("eslint");
    }
  },
  devServer: {
    proxy: {
      '^/(auth|api|tmp-upload|viz|stat|ml|mcp|healthz)': {
        target: process.env.VUE_APP_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
