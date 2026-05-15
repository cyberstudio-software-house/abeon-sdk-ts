import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'client/index': 'src/client/index.ts',
        'server/index': 'src/server/index.ts',
        'react/index': 'src/react/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    target: 'es2022',
    external: ['react', 'react-dom', 'next/headers', 'next/server', 'laravel-echo', 'pusher-js'],
});
