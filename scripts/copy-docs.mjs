import { cp } from 'node:fs/promises';
await cp('Docs', 'dist/Docs', { recursive: true });
