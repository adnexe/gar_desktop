import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const garApiUrl = env.GAR_API_URL || process.env.GAR_API_URL || 'http://127.0.0.1:8000';

    return {
        main: {
            define: {
                'process.env.GAR_API_URL': JSON.stringify(garApiUrl),
            },
            plugins: [externalizeDepsPlugin()],
            build: {
                rollupOptions: {
                    input: {
                        index: resolve(__dirname, 'electron/main.ts'),
                    },
                },
            },
        },
        preload: {
            plugins: [externalizeDepsPlugin()],
            build: {
                rollupOptions: {
                    input: {
                        index: resolve(__dirname, 'electron/preload.ts'),
                    },
                },
            },
        },
        renderer: {
            root: '.',
            build: {
                rollupOptions: {
                    input: resolve(__dirname, 'index.html'),
                },
            },
            plugins: [vue(), tailwindcss()],
            resolve: {
                alias: {
                    '@': resolve(__dirname, 'src'),
                },
            },
        },
    };
});
