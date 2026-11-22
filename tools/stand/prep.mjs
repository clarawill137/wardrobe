// Картинки для стенда. Свои 2:3 картинки положи в samples/oil1.png и samples/oil2.png (в репу их не коммить —
// она публичная); если их нет — рисуются заглушки. Из них собираются «старая карандашная» 4:3 и квадратные вещи.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.NODE_TOOLS || '/opt/npm-tools/node_modules/');
const sharp = require('sharp');
const S = (f) => path.join(HERE, 'samples', f);
fs.mkdirSync(path.join(HERE, 'samples'), { recursive: true });

const figure = (bg, coat, dress) => `<svg xmlns="http://www.w3.org/2000/svg" width="848" height="1264">
  <rect width="848" height="1264" fill="${bg}"/>
  <g transform="translate(70,140)"><circle cx="110" cy="80" r="62" fill="#c9a189"/><path d="M40 170h140l30 520H10z" fill="${dress}"/><path d="M30 170h60l-20 330H10zM190 170h-60l20 330h60z" fill="${coat}"/><rect x="60" y="690" width="30" height="300" fill="#c9a189"/><rect x="130" y="690" width="30" height="300" fill="#c9a189"/></g>
  <g transform="translate(400,60) scale(1.5)"><circle cx="150" cy="90" r="70" fill="#c9a189"/><path d="M60 190h180l40 560H20z" fill="${dress}"/><path d="M40 190h80l-25 420H10zM260 190h-80l25 420h80z" fill="${coat}"/></g>
</svg>`;

for (const [f, bg, coat, dress] of [['oil1.png', '#e4e3e6', '#1b1b1d', '#121214'], ['oil2.png', '#e6e5e8', '#efe6d4', '#6f7a3a']]) {
    if (!fs.existsSync(S(f))) await sharp(Buffer.from(figure(bg, coat, dress))).png().toFile(S(f));
}
const a = await sharp(S('oil1.png')).resize({ height: 600 }).toBuffer();
const b = await sharp(S('oil2.png')).resize({ height: 600 }).toBuffer();
await sharp({ create: { width: 800, height: 600, channels: 3, background: '#111' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 400, top: 0 }]).jpeg().toFile(S('clover43.jpg'));
await sharp(S('oil1.png')).extract({ left: 420, top: 300, width: 420, height: 420 }).jpeg().toFile(S('item_sq.jpg'));
await sharp(S('oil2.png')).extract({ left: 420, top: 250, width: 420, height: 420 }).jpeg().toFile(S('item_sq2.jpg'));
await sharp({ create: { width: 64, height: 64, channels: 3, background: '#7a4a2a' } }).png().toFile(S('rb64.png'));
console.log('samples готовы:', fs.readdirSync(path.join(HERE, 'samples')).join(', '));
