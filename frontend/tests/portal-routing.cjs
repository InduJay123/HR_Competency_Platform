// Run after npm run build. Uses an isolated session stub; no database required.
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { once } = require('node:events');
async function main() {
  const backend = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ authenticated: !!req.headers.cookie, is_platform_admin: req.headers.cookie === 'sessionid=superadmin' }));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const reservation = http.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, NODE_ENV: 'production', ADMIN_FRONTEND_URL: '', FRONTEND_URL: '', BACKEND_URL: `http://127.0.0.1:${backend.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { clearInterval(poll); reject(new Error(output)); }, 20000);
      const poll = setInterval(() => { if (output.includes('Ready')) { clearInterval(poll); clearTimeout(timer); resolve(); } }, 100);
    });
    async function check(host, path, cookie, destination) {
      const response = await new Promise((resolve, reject) => {
        const req = http.get({ hostname: '127.0.0.1', port, path, headers: { Host: host, ...(cookie ? { Cookie: cookie } : {}) } }, res => {
          let body = ''; res.on('data', data => body += data); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }); req.on('error', reject);
      });
      if (destination) {
        assert.equal(response.status, 307);
        assert.equal(new URL(response.headers.location, `https://${host}`).pathname, destination);
      } else {
        assert.equal(response.status, 200);
        assert.match(response.body, /PLATFORM ADMINISTRATION/);
        assert.doesNotMatch(response.body, /Chief Steward|Steward Guy/);
      }
      if (path === '/') { assert.notEqual(response.headers['x-nextjs-cache'], 'HIT'); assert.equal(response.headers['x-nextjs-prerender'], undefined); }
      console.log(`PASS ${host}${path} [${cookie || 'anonymous'}] -> ${response.headers.location || '200 admin login'}`);
    }
    for (const host of ['btflplatform.com', 'www.btflplatform.com']) await check(host, '/', '', '/employee/dashboard');
    for (const cookie of ['', 'sessionid=normal', 'sessionid=superadmin']) {
      await check('admin.btflplatform.com', '/', cookie, cookie.endsWith('superadmin') ? '/platform' : '/admin/login');
      await check('admin.btflplatform.com', '/admin/login', cookie, cookie.endsWith('superadmin') ? '/platform' : null);
    }
    await check('admin.btflplatform.com', '/platform', 'sessionid=normal', '/admin/login');
    await check('admin.btflplatform.com', '/auth/login', '', '/admin/login');
    for (const host of ['localhost', '127.0.0.1']) await check(host, '/admin/login', '', null);
  } finally {
    child.kill();
    await once(child, 'exit');
    await new Promise(resolve => backend.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
