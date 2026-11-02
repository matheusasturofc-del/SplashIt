// Renderiza a animação quadro a quadro no Chromium (Playwright) e entrega ao ffmpeg.
//   node render.js                 -> build/video_mudo.mp4 + build/sfx.json
//   node render.js stills 3 10.5   -> build/still_3.png, build/still_10.5.png
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const BUILD = path.join(ROOT, 'build');
const FPS = 30;

(async () => {
  const timeline = JSON.parse(fs.readFileSync(path.join(BUILD, 'timeline.json'), 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'scene.html'));
  await page.evaluate(async tl => {
    await Promise.all(['500', '600', '700'].map(w => document.fonts.load(`${w} 40px F`)));
    window.setup(tl);
  }, timeline);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

  const grab = t => page.evaluate(t => { window.draw(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, t);

  if (process.argv[2] === 'stills') {
    for (const a of process.argv.slice(3)) {
      const t = parseFloat(a);
      const png = await page.evaluate(t => { window.draw(t); return document.getElementById('c').toDataURL('image/png'); }, t);
      fs.writeFileSync(path.join(BUILD, `still_${a}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    if (errors.length) console.error(errors.join('\n'));
    await browser.close();
    return;
  }

  fs.writeFileSync(path.join(BUILD, 'sfx.json'), JSON.stringify(await page.evaluate(() => window.sfxEvents()), null, 1));
  const n = Math.ceil(timeline.duration * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', path.join(BUILD, 'video_mudo.mp4')],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const url = await grab(i / FPS);
    if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`quadro ${i}/${n} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log(`pronto: ${n} quadros em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})();
