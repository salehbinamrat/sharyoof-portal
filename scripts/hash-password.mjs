import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await new Promise(resolve => rl.question('Admin password (min. 12 characters): ', resolve));
rl.close();
if (password.length < 12) { console.error('Password must have at least 12 characters.'); process.exit(1); }
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 210000, 32, 'sha256');
console.log('ADMIN_PASSWORD_HASH=' + salt.toString('base64') + ':' + hash.toString('base64'));
console.log('Put this entire value in a Cloudflare Worker SECRET, not in GitHub or wrangler.toml.');
