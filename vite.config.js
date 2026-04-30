import { cpSync, existsSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';

const staticRuntimeDirs = ['css', 'js', 'pages', 'data', 'department-profiles'];

function copyStaticRuntimeDirs() {
    return {
        name: 'copy-static-runtime-dirs',
        closeBundle() {
            staticRuntimeDirs.forEach((dir) => {
                const source = resolve(__dirname, dir);
                if (!existsSync(source)) return;
                cpSync(source, resolve(__dirname, 'dist', dir), { recursive: true });
            });
        }
    };
}

export default defineConfig({
    plugins: [copyStaticRuntimeDirs()],
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, 'login.html'),
                publicSchedule: resolve(__dirname, 'public-schedule.html')
            }
        }
    }
});
