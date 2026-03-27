const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: process.env.DISABLE_ESLINT_PLUGIN === "true" ? false : undefined,
  chainWebpack: (config) => {
    if (process.env.NODE_ENV === "production" || process.env.DISABLE_ESLINT_PLUGIN === "true") {
      config.plugins.delete("eslint");
    }
  },
  devServer: {
    client: process.env.DISABLE_ESLINT_PLUGIN === "true" ? { overlay: false } : undefined,
    proxy: {
      '^/(auth|api|tmp-upload|viz|stat|ml|mcp|healthz)': {
        target: process.env.VUE_APP_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
