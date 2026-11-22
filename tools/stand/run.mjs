// Прогон Гардероба 1.8 в настоящем Chrome на экране айфона: страница образов, импорт фото/промта, версии, надеть.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
import fs from 'node:fs';

const require = createRequire(process.env.NODE_TOOLS || '/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const PORT = 8765;
const URL0 = `http://localhost:${PORT}/`;
const OUT = path.join(HERE, 'shots');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(`${OUT}/${f}`);
fs.rmSync(path.join(HERE, 'user/images'), { recursive: true, force: true });

const srv = spawn('node', [path.join(HERE, 'server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 600));

const fails = [];
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { console.log('  ✗', msg); fails.push(msg); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = async (name) => { await sleep(350); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('  📸', name); };
const S = () => page.evaluate(() => SillyTavern.getContext().extensionSettings.wardrobe);
const click = async (sel) => { await page.locator(sel).first().click(); await sleep(250); };

await page.goto(URL0);
await page.waitForFunction(() => window.Wardrobe?.version);
console.log('— загрузка');
let s = await S();
ok(s.imgStyle === 'oil' && s.imgStylePrev === 'clover', `миграция стиля: ${s.imgStyle} (было ${s.imgStylePrev})`);
ok(Array.isArray(s.cats) && s.cats.includes('Офис'), `разделы по умолчанию: ${s.cats.join(', ')}`);

console.log('— страница образов');
await page.evaluate(() => Wardrobe.open('sets', 'Хеди')); // как зовёт Life
await sleep(700);
ok(await page.locator('#wd-panel.wd-full').count() === 1, 'Life «sets» открывает коллекцию на весь экран');
ok(await page.locator('.wd-lk-who.on[data-name="Хеди"]').count() === 1, 'выбрана Хеди');
s = await S();
const own = (id) => s.sets.find(x => x.id === id).owner;
ok(own('s7') === 'Хеди' && own('s8') === 'Хеди' && own('s9') === 'Хеди' && own('s5') === '', `владельцы разобраны: «Хеди, осень» → ${own('s7')}, «Летний вечер» (вещи Хеди) → ${own('s8')}, «Хеди — шуба» у Баки → ${own('s9')}, пижама — ${own('s5') || 'общая'}`);
await page.waitForSelector('.wd-toast:has-text("Разобрала владельцев")', { timeout: 3000 }).then(() => ok(true, 'тост о разборе владельцев'), () => ok(false, 'тост о разборе владельцев'));
const cardsHedy = await page.locator('.wd-lk-card').count();
ok(cardsHedy === 9, `у Хеди 8 своих + 1 общий внизу: ${cardsHedy}`);
ok((await page.locator('.wd-lk-sub').innerText()).includes('общих 1'), 'в шапке: «общих 1»');
ok(await page.locator('.wd-lk-sec.shared ~ .wd-lk-grid .wd-lk-card').count() === 1, 'общий — отдельным блоком внизу');
const chipTexts = await page.locator('.wd-lk-cats .wd-chip').allInnerTexts();
console.log('    чипы:', chipTexts.map(t => t.replace(/\s+/g, ' ')).join(' | '));
ok(['Офис', 'Вечернее', 'Спортивное'].every(c => chipTexts.some(t => t.includes(c))), 'её три раздела видны всегда');
await shot('01-looks-hedy');
await page.evaluate(() => document.querySelector('#wd-panel .wd-body').scrollTo(0, 700));
await shot('02-looks-hedy-scrolled');
await page.evaluate(() => document.querySelector('#wd-panel .wd-body').scrollTo(0, 0));

await click('.wd-lk-cats .wd-chip:has-text("Вечернее")');
ok(await page.locator('.wd-lk-card').count() === 1, 'раздел «Вечернее» — один образ');
await shot('03-cat-evening');
await click('.wd-lk-cats .wd-chip:has-text("Все")');

await click('.wd-lk-who[data-name="*"]');
ok(await page.locator('.wd-lk-card').count() === 10, 'все персонажи — 10 образов');
await shot('04-all');

console.log('— у Баки только его образы');
await click('.wd-lk-who[data-name="Bucky Barnes"]');
const bucky = await page.locator('.wd-lk-card .wd-lk-name').allInnerTexts();
ok(!bucky.some(t => /Хеди/.test(t)), `у Баки нет образов Хеди: ${bucky.join(' | ')}`);
await shot('04b-bucky');
await click('.wd-lk-sec.shared ~ .wd-lk-grid .wd-lk-owner');
ok(await page.locator('.wd-modal-title').innerText().then(t => t.includes('Чей образ')), 'тап по «общий» — выбор владельца');
await click('.wd-modal [data-act="look-owner-set"][data-name="Bucky Barnes"]');
s = await S();
ok(s.sets.find(x => x.id === 's5').owner === 'Bucky Barnes' && await page.locator('.wd-lk-sec.shared').count() === 0, 'пижама теперь у Баки, блок «Общие» пропал');
await click('.wd-lk-card[data-id="s5"] .wd-lk-info');
await page.locator('.wd-modal [data-f="owner"]').selectOption('');
await click('.wd-modal [data-act="look-save"]');
s = await S();
ok(s.sets.find(x => x.id === 's5').owner === '', 'и обратно в общие через карточку');
await click('.wd-lk-who[data-name="Хеди"]');

console.log('— разложить по разделам (ИИ)');
await click('.wd-lk-sort');
await page.waitForFunction(() => !document.querySelector('.wd-lk-sort .fa-spin'), null, { timeout: 8000 });
await sleep(300);
s = await S();
ok(s.sets.find(x => x.id === 's3').cat === 'Спортивное' && s.sets.find(x => x.id === 's6').cat === 'Дом и сон', `пробежка → ${s.sets.find(x => x.id === 's3').cat}, дома → ${s.sets.find(x => x.id === 's6').cat}`);
await shot('05-after-autocat');

console.log('— «＋ Образ» с фото');
await page.evaluate(() => { window.__gens.length = 0; window.__calls.length = 0; });
await click('.wd-lk-add');
await shot('06-add-modal');
await page.locator('[data-input="lkfile"]').setInputFiles(path.join(HERE, 'samples/oil2.png'));
await page.waitForFunction(() => !window.SillyTavern && false || document.querySelector('.wd-lk-drop-prev img'), null, { timeout: 8000 });
await page.waitForFunction(() => !document.querySelector('.wd-lk-drop.wd-drawing'), null, { timeout: 8000 });
await shot('07-add-photo');
await click('[data-act="look-import"]');
await sleep(200);
ok(await page.locator('.wd-lk-busy').count() === 1, 'карточка сразу появилась с «ИИ разбирает образ…»');
const bb = await page.locator('.wd-lk-busy').first().boundingBox();
ok(bb && bb.y < 700, `и видна наверху, а не в конце страницы (y=${Math.round(bb?.y)})`);
await shot('08-pending');
await page.waitForFunction(() => {
    const s = SillyTavern.getContext().extensionSettings.wardrobe;
    const set = s.sets.find(x => x.src?.img && x.at);
    return set && !set.pending && set.itemIds.length && (set.imgs || []).length >= 2;
}, null, { timeout: 30000 });
await page.waitForFunction(() => !document.querySelector('[data-act="draw-stop"]') && window.__gens.length >= 6, null, { timeout: 40000 }).catch(() => {});
await sleep(800);
s = await S();
const look = s.sets.find(x => x.src?.img && x.at);
const its = look.itemIds.map(id => s.items.find(i => i.id === id));
console.log('    образ:', look.name, '|', look.cat, '|', its.map(i => `${i.name}${i.id === 'i3' ? ' (старая)' : ''}`).join(', '));
ok(look.name === 'Кремовый блейзер и оливковый шёлк', 'название от ИИ');
ok(look.cat === 'Вечернее', 'раздел «вечерний» → «Вечернее»');
ok(/cream oversized/.test(look.prompt), 'промт считан и сохранён');
ok(its.length === 6 && !its.some(i => i.slot === 'hair'), `6 вещей, причёски нет (галка «причёска» выключена): ${its.length}`);
ok(look.itemIds.includes('i3'), 'тонкий золотой браслет взят из шкафа, не продублирован');
ok(its.filter(i => i.id !== 'i3').every(i => i.owner === 'Хеди' && i.look === look.id), 'новые вещи — Хеди, помечены образом');
ok((look.imgs || []).length === 2 && look.imgs[0] === look.src.img && look.img === look.imgs[1], 'версии: фото + нарисованное маслом поверх');
const gens = await page.evaluate(() => window.__gens);
ok(gens.length === 6, `нарисовано: обложка + 5 новых вещей = ${gens.length}`);
const cover = gens[0];
const coverText = cover.messages[0].content.find(p => p.type === 'text')?.text || '';
const coverRefs = cover.messages[0].content.filter(p => p.type === 'image_url').length;
ok(cover.image_config.aspect_ratio === '2:3', `обложка 2:3: ${cover.image_config.aspect_ratio}`);
ok(/oil painting/i.test(coverText) && /worn by someone else/.test(coverText), 'промт обложки: масло + «повтори одежду с фото, не человека»');
ok(coverRefs === 2, `рефы обложки: лицо + фото образа = ${coverRefs}`);
const itemGen = gens[1];
ok(itemGen.messages[0].content.filter(p => p.type === 'image_url').length === 2 && /reproduce ONLY this item/.test(itemGen.messages[0].content.find(p => p.type === 'text').text), 'вещь рисуется по фото образа (лицо + фото)');
await shot('09-imported');

console.log('— карточка образа');
await page.locator(`.wd-lk-card[data-id="${look.id}"] .wd-lk-info`).click();
await sleep(400);
await shot('10-look-modal');
await page.evaluate(() => document.querySelector('.wd-modal-body').scrollTo(0, 2000));
await shot('11-look-modal-bottom');
await page.locator('.wd-modal [data-act="img-step"][data-dir="-1"]').click();
await sleep(300);
s = await S();
ok(s.sets.find(x => x.id === look.id).img === look.src.img, '‹ — вернулась к исходному фото');
await page.locator('.wd-modal [data-act="img-step"][data-dir="1"]').click();
await sleep(200);
await click('.wd-modal [data-act="modal-close"].wd-x');

console.log('— свайп по карточке');
const box = await page.locator(`.wd-lk-card[data-id="${look.id}"] .wd-lk-img`).boundingBox();
const cdp = await context.newCDPSession(page);
const y = box.y + box.height / 2;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 20, y }] });
for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 20 - i * 18, y: y + i }] }); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(400);
s = await S();
ok(s.sets.find(x => x.id === look.id).img === look.src.img, 'свайп влево — следующая версия (по кругу: фото)');
ok(await page.locator('.wd-modal').count() === 0, 'свайп не открыл карточку');
await shot('12-after-swipe');

console.log('— надеть');
await page.locator(`.wd-lk-card[data-id="${look.id}"] .wd-lk-wear`).click();
await sleep(500);
const worn = await page.evaluate(() => SillyTavern.getContext().chatMetadata.wardrobe.chars['Хеди'].worn.map(e => e.name));
ok(look.itemIds.every(id => s.items.find(i => i.id === id)) && worn.includes('кремовый блейзер оверсайз') && worn.includes('обручальное кольцо') && !worn.includes('белый лабораторный халат'), `на Хеди: ${worn.join(', ')}`);
ok(await page.locator(`.wd-lk-card[data-id="${look.id}"].on .wd-lk-badge`).count() === 1, 'карточка: ✓ надето');
ok(await page.locator('.wd-toast').count() >= 1, 'тост виден внутри страницы');
await shot('13-worn');

console.log('— скопировать промт');
await page.locator(`.wd-lk-card[data-id="${look.id}"] .wd-lk-copy`).click();
await sleep(400);
const clip = await page.evaluate(() => navigator.clipboard.readText());
ok(clip === look.prompt, 'в буфере — промт образа');
await shot('14-copied');

console.log('— стиль');
await click('.wd-lk-style');
await shot('15-style-modal');
await click('.wd-style-opt[data-v="clover"]');
ok((await page.locator('.wd-lk-style').innerText()).includes('Карандаш'), 'переключилась на карандаш');
await click('.wd-lk-style');
await click('.wd-style-opt[data-v="oil"]');
ok((await page.locator('.wd-lk-style').innerText()).includes('Масло'), 'и обратно на масло');

console.log('— «＋ Образ» готовым промтом');
await page.evaluate(() => {
    window.__gens.length = 0;
    window.__lookReply = { name: 'Серый спорт-костюм', cat: 'sport', prompt: 'heather grey zip-up track jacket, matching wide-leg joggers, white sneakers', items: [{ name: 'серая олимпийка на молнии', slot: 'top', desc: 'меланж' }, { name: 'серые широкие джоггеры', slot: 'bottom', desc: 'меланж' }, { name: 'белые кроссовки', slot: 'shoes', desc: '' }] };
});
await click('.wd-lk-cats .wd-chip:has-text("Спортивное")');
await click('.wd-lk-add');
ok(await page.locator('[data-input="lkcat"]').inputValue() === 'Спортивное', 'раздел подставился из открытого');
await page.locator('[data-input="lktext"]').fill('Prompt: young man, grey zip-up track jacket and wide joggers, white sneakers, studio light, 8k, masterpiece');
await page.evaluate(() => { document.querySelector('[data-input="lkitems"]').checked = false; });
await click('[data-act="look-import"]');
await page.waitForFunction(() => SillyTavern.getContext().extensionSettings.wardrobe.sets.some(x => x.name === 'Серый спорт-костюм' && !x.pending && (x.imgs || []).length === 1), null, { timeout: 20000 });
await sleep(500);
s = await S();
const sp = s.sets.find(x => x.name === 'Серый спорт-костюм');
ok(sp.cat === 'Спортивное' && sp.itemIds.length === 3, `промт → «Спортивное», 3 вещи`);
ok(sp.itemIds.includes('i8'), 'белые кроссовки — те же, что уже были в шкафу');
const g2 = await page.evaluate(() => window.__gens);
ok(g2.length === 1 && g2[0].messages[0].content.filter(p => p.type === 'image_url').length === 1, 'промт: нарисована только обложка, реф — одно лицо');
await shot('16-prompt-import');

console.log('— ошибка разбора и «повторить»');
await page.evaluate(() => { window.__lookReply = { name: 'x', items: [] }; });
await click('.wd-lk-cats .wd-chip:has-text("Все")');
await click('.wd-lk-add');
await page.locator('[data-input="lktext"]').fill('какая-то ерунда без одежды');
await click('[data-act="look-import"]');
await page.waitForSelector('.wd-lk-err', { timeout: 10000 });
const eb = await page.locator('.wd-lk-err').first().boundingBox();
ok(eb && eb.y < 700, `ошибка разбора видна наверху (y=${Math.round(eb?.y)})`);
await shot('17-error');
await page.evaluate(() => { window.__lookReply = { name: 'Вторая попытка', cat: 'Офис', prompt: 'navy blazer', items: [{ name: 'тёмно-синий блейзер', slot: 'outer', desc: '' }] }; });
await click('.wd-lk-err');
await page.waitForFunction(() => SillyTavern.getContext().extensionSettings.wardrobe.sets.some(x => x.name === 'Вторая попытка' && !x.err && !x.pending), null, { timeout: 10000 });
ok(true, '«повторить» разобрал заново');

console.log('— Life и остальные вкладки');
const lifeSets = await page.evaluate(() => Wardrobe.setsFor().map(x => x.name));
ok(!lifeSets.some(n => /Новый образ/.test(n)), 'setsFor не отдаёт неразобранные');
await click('[data-act="look-back"]');
ok(await page.locator('#wd-panel.wd-full').count() === 0, '← возвращает в обычную плашку');
await shot('18-worn-tab');
await click('.wd-tab[data-tab="closet"]');
await shot('19-closet');
await click('.wd-tab[data-tab="cfg"]');
await page.evaluate(() => document.querySelector('#wd-panel .wd-body').scrollTo(0, 650));
await shot('20-cfg');
await click('.wd-tab[data-tab="looks"]');
ok(await page.locator('#wd-panel.wd-full').count() === 1, 'вкладка «Образы» — снова на весь экран');

console.log('— пустой персонаж');
await click('.wd-lk-who[data-name="Natasha Romanoff"]');
await shot('21-empty');

console.log('— компьютер');
await page.setViewportSize({ width: 1280, height: 800 });
await click('.wd-lk-who[data-name="Хеди"]');
await sleep(500);
await shot('22-desktop');

console.log('\nошибки страницы:', errors.length ? errors : 'нет');
await browser.close();
srv.kill();
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n- ${fails.join('\n- ')}` : '\nвсё прошло');
process.exit(fails.length ? 1 : 0);
