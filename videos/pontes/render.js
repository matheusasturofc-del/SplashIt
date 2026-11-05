// Renderiza a animação quadro a quadro no Chromium (Playwright) e entrega ao ffmpeg.
//   node render.js                 -> build/video_mudo.mp4 + build/sfx.json
//   node render.js stills 3 10.5   -> build/still_3.png, build/still_10.5.png
// Variável WORKERS (padrão 2) divide os quadros entre vários navegadores.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const BUILD = path.join(ROOT, 'build');
const FPS = 30;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };

function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function openScene(browser, url, timeline) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  try { await page.waitForFunction(() => window.sceneReady === true, null, { timeout: 60000 }); }
  catch (e) { throw new Error('a cena não carregou:\n' + errors.join('\n')); }
  await page.evaluate(async tl => {
    await Promise.all(['500', '600', '700'].map(w => document.fonts.load(`${w} 40px F`)));
    window.setup(tl);
  }, timeline);
  if (errors.length) throw new Error(errors.join('\n'));
  return { page, errors };
}

async function renderRange(browser, url, timeline, from, to, file, tag) {
  const { page, errors } = await openScene(browser, url, timeline);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = from; i < to; i++) {
    const url64 = await page.evaluate(t => { window.draw(t); return document.getElementById('c').toDataURL('image/jpeg', 0.94); }, i / FPS);
    if (!ff.stdin.write(Buffer.from(url64.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if ((i - from) % 150 === 0) console.log(`[${tag}] quadro ${i - from}/${to - from} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (errors.length) throw new Error(errors.join('\n'));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await page.close();
}

(async () => {
  const timeline = JSON.parse(fs.readFileSync(path.join(BUILD, 'timeline.json'), 'utf8'));
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/scene.html${process.env.Q || ''}`;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (process.argv[2] === 'stills') {
      const { page, errors } = await openScene(browser, url, timeline);
      for (const a of process.argv.slice(3)) {
        const t0 = Date.now();
        const png = await page.evaluate(t => { window.draw(t); return document.getElementById('c').toDataURL('image/png'); }, parseFloat(a));
        fs.writeFileSync(path.join(BUILD, `still_${a}.png`), Buffer.from(png.split(',')[1], 'base64'));
        console.log(`still ${a}: ${Date.now() - t0}ms`);
      }
      if (errors.length) console.error(errors.join('\n'));
      return;
    }
    const { page } = await openScene(browser, url, timeline);
    fs.writeFileSync(path.join(BUILD, 'sfx.json'), JSON.stringify(await page.evaluate(() => window.sfxEvents()), null, 1));
    await page.close();
    const n = Math.ceil(timeline.duration * FPS);
    const workers = Math.max(1, parseInt(process.env.WORKERS || '2', 10));
    const per = Math.ceil(n / workers);
    const parts = [];
    const t0 = Date.now();
    await Promise.all(Array.from({ length: workers }, (_, w) => {
      const file = path.join(BUILD, `parte_${w}.mp4`); parts.push(file);
      if (process.env.PART !== undefined && +process.env.PART !== w) return null;  // re-renderiza só uma parte
      return renderRange(browser, url, timeline, w * per, Math.min(n, (w + 1) * per), file, `w${w}`);
    }));
    const list = path.join(BUILD, 'partes.txt');
    fs.writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
    await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy',
      path.join(BUILD, 'video_mudo.mp4')], { stdio: 'inherit' }).on('close', c => (c ? rej(new Error('concat')) : res())));
    console.log(`pronto: ${n} quadros em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
