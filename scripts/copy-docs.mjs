import { cp } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import init, { dispatch } from '../web/pkg/wisp.js';

await cp('Docs', 'dist/Docs', { recursive: true });
// Publish the actual compiled core's discovery, not a hand-maintained wishlist.
await init({ module_or_path: await readFile(new URL('../web/pkg/wisp_bg.wasm', import.meta.url)) });
const raw = dispatch('{"op":"capabilities","source":""}');
const manifest = JSON.parse(raw);
if (manifest.status !== 'Ready' || manifest.capabilities.discovery_contract_version !== 1 || Buffer.byteLength(raw) > 32768) {
  throw new Error('Compiler capability manifest is invalid or exceeds 32 KiB');
}
await writeFile('dist/agent.json', raw);
