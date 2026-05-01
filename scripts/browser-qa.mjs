import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve('.');
const port = Number(process.env.PORT || 4173);
const debugPort = Number(process.env.DEBUG_PORT || (9223 + Math.floor(Math.random() * 1000)));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].find(existsSync);

if (!chromePath) {
  console.error('Chrome or Edge was not found for browser smoke testing.');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = normalize(join(root, decoded === '/' ? 'index.html' : decoded));
  return target.startsWith(root) ? target : null;
}

const server = createServer((request, response) => {
  const filePath = safePath(request.url || '/');
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': types[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
});

function requestJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`Request failed ${response.status}: ${url}`);
    }
    return response.json();
  });
}

async function waitForDebugTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await requestJson(`http://127.0.0.1:${debugPort}/json`);
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (target) return target;
    } catch {
      await delay(100);
    }
  }
  throw new Error('Timed out waiting for Chrome DevTools target.');
}

function createCdpClient(wsUrl) {
  let id = 0;
  const pending = new Map();
  const socket = new WebSocket(wsUrl);

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: ok, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else ok(message.result);
    }
  });

  return new Promise((resolveClient, rejectClient) => {
    socket.addEventListener('open', () => {
      resolveClient({
        send(method, params = {}) {
          const messageId = id += 1;
          socket.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
        },
        close() {
          socket.close();
        }
      });
    }, { once: true });
    socket.addEventListener('error', rejectClient, { once: true });
  });
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  }
  return result.result.value;
}

async function waitFor(client, expression, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(client, expression)) return true;
    await delay(100);
  }
  return false;
}

await new Promise((resolveServer) => server.listen(port, resolveServer));

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-networking',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${debugPort}`,
  'about:blank'
], { stdio: 'ignore' });

const errors = [];

try {
  const target = await waitForDebugTarget();
  const client = await createCdpClient(target.webSocketDebuggerUrl);
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await client.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  const ready = await waitFor(client, `window.__magnificentSevenReady === true`, 12000);
  if (!ready) throw new Error('Page did not finish loading the interactive script.');
  await delay(900);

  const base = await evaluate(client, `(() => ({
    readyState: document.readyState,
    appReady: window.__magnificentSevenReady === true,
    manifestLinks: document.querySelectorAll('link[rel="manifest"]').length,
    soundStart: !!document.querySelector('#soundStart'),
    heroImg: !!document.querySelector('#heroSceneImage') && document.querySelector('#heroSceneImage').complete,
    journeyBg: !!document.querySelector('.journey-bg img[src*="endless-road-cowboy.png"]'),
    journeyMotion: getComputedStyle(document.documentElement).getPropertyValue('--journey-progress').trim() !== '',
    viewTransitionRef: document.documentElement.innerHTML.includes('startViewTransition'),
    operators: document.querySelectorAll('[data-profile-id]').length,
    overflow: document.body.scrollWidth > window.innerWidth + 2,
    canvasReady: (() => {
      const canvas = document.querySelector('#heroCanvas');
      const context = canvas && canvas.getContext('2d');
      if (!context || canvas.width === 0 || canvas.height === 0) return false;
      const points = [[24, 24], [Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)], [80, Math.floor(window.innerHeight * 0.8)]];
      return points.some(([x, y]) => context.getImageData(x, y, 1, 1).data[3] > 0);
    })()
  }))()`);

  await evaluate(client, `document.querySelector('#soundStart').click();`);
  await delay(300);
  const sound = await evaluate(client, `document.querySelector('#soundStart').getAttribute('aria-pressed') === 'true'`);

  await evaluate(client, `document.querySelector('[data-profile-id="horizon-walker"]').click();`);
  await delay(500);
  const profile = await evaluate(client, `(() => {
    const takeover = document.querySelector('#profileTakeover');
    return takeover.classList.contains('is-open') &&
      takeover.getAttribute('aria-hidden') === 'false' &&
      document.body.classList.contains('is-profile-open') &&
      takeover.textContent.includes('THE HORIZON WALKER');
  })()`);

  await evaluate(client, `document.querySelector('#profileNext').click();`);
  await waitFor(client, `document.querySelector('#profileTakeover').textContent.includes('THE BLOODHOUND')`, 3000);
  const next = await evaluate(client, `document.querySelector('#profileTakeover').textContent.includes('THE BLOODHOUND')`);

  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(350);
  const esc = await evaluate(client, `!document.querySelector('#profileTakeover').classList.contains('is-open') && !document.body.classList.contains('is-profile-open')`);

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await delay(300);
  const mobile = await evaluate(client, `document.body.scrollWidth <= window.innerWidth + 2`);

  client.close();

  const results = { base, sound, profile, next, esc, mobile, errors };
  console.log(JSON.stringify(results, null, 2));

  const failed = [
    base.soundStart,
    base.heroImg,
    base.journeyBg,
    base.journeyMotion,
    base.viewTransitionRef,
    base.operators === 7,
    !base.overflow,
    base.canvasReady,
    sound,
    profile,
    next,
    esc,
    mobile,
    errors.length === 0
  ].some((value) => !value);

  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  chrome.kill();
  server.close();
}
