import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url),'utf8');

test('Deploys preserve dashboard-configured runtime secrets',()=>{
 assert.match(wrangler, /^keep_vars\s*=\s*true\s*$/m);
});
test('Automated deploy explains missing Cloudflare Actions secrets',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/Missing CLOUDFLARE_API_TOKEN/);
 assert.match(workflow,/Missing CLOUDFLARE_ACCOUNT_ID/);
});
