// Гардероб по эпохам («Священный таймлайн»): облики, общее внутри эпохи, костюмер, лицо по облику.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.NODE_TOOLS || '/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const srv = spawn('node', [path.join(HERE, 'server.mjs')], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails.push(m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8765/');
await page.waitForFunction(() => window.Wardrobe?.version);
const S = () => page.evaluate(() => SillyTavern.getContext().extensionSettings.wardrobe);
const era = async (e) => {
    await page.evaluate((x) => { window.__era = x; }, e);
    await sleep(650); // память облика — полсекунды
    await page.evaluate(() => window.__emit('sacred-timeline:changed'));
    await sleep(300);
};
const cards = () => page.locator('.wd-lk-card .wd-lk-name').allInnerTexts();

console.log('— 2024 (основная ролка)');
await page.evaluate(() => Wardrobe.open('looks', 'Хеди'));
await page.waitForFunction(() => SillyTavern.getContext().extensionSettings.wardrobe.migrSlice === true, null, { timeout: 5000 });
await page.waitForFunction(() => SillyTavern.getContext().extensionSettings.wardrobe.sets.find(x => x.id === 's7')?.slice, null, { timeout: 5000 });
await sleep(400);
let s = await S();
const sl = (id) => s.sets.find(x => x.id === id)?.slice;
ok(sl('s1') === 'hedy.2024' && sl('s4') === 'bucky.2024', `старые образы — облик основной ролки: ${sl('s1')}, ${sl('s4')}`);
ok(sl('s7') === 'hedy.2024' && sl('s9') === 'hedy.2024', `разобранные по владельцам тоже получили облик: «Хеди, осень» ${sl('s7')}, «Хеди — шуба» ${sl('s9')}`);
ok(!sl('s5'), 'общая пижама — без облика (общая)');
ok(sl('s10') === 'hedy.2024', `чужой облик после разбора 1.8.1 починен: «Кофе с утра» ${sl('s10')}`);
const in2024 = await cards();
ok(in2024.length === 9 && in2024.includes('Пижама на двоих') && in2024.includes('Кофе с утра'), `в 2024 у Хеди 8 своих + общая пижама: ${in2024.length}`);

console.log('— 1943');
await era('1943');
const in1943 = await cards();
ok(in1943.length === 0, `в сороковых образов 2024-го нет: ${in1943.join(' | ') || 'пусто'}`);
ok(await page.locator('.wd-lk-sec.shared').count() === 0, 'и общая пижама 2024-го не всплывает');
ok(await page.locator('.wd-chip[data-act="all-eras"]').count() === 1, 'есть «🕰 Все эпохи»');
await page.locator('.wd-chip[data-act="all-eras"]').click(); await sleep(300);
ok((await cards()).length >= 9, '«Все эпохи» — видно всё');
await page.locator('.wd-chip[data-act="all-eras"]').click(); await sleep(300);

await page.evaluate(() => { window.__lookReply = { name: 'Шинель и берет', cat: 'Миссия', prompt: 'olive wool army greatcoat, black beret', items: [{ name: 'оливковая армейская шинель', slot: 'outer', desc: 'шерсть' }, { name: 'чёрный берет', slot: 'head', desc: '' }] }; window.__gens.length = 0; });
await page.locator('.wd-lk-add').click(); await sleep(300);
await page.locator('[data-input="lktext"]').fill('greatcoat and beret');
await page.evaluate(() => { document.querySelector('[data-input="lkitems"]').checked = false; });
await page.locator('[data-act="look-import"]').click();
await page.waitForFunction(() => SillyTavern.getContext().extensionSettings.wardrobe.sets.some(x => x.name === 'Шинель и берет' && !x.pending && (x.imgs || []).length), null, { timeout: 20000 });
await sleep(400);
s = await S();
const coat = s.sets.find(x => x.name === 'Шинель и берет');
ok(coat.slice === 'hedy.1943', `образ из сороковых — облик 1943-го: ${coat.slice}`);
ok(coat.itemIds.map(id => s.items.find(i => i.id === id)).every(i => i.slice === 'hedy.1943'), 'его вещи — тоже облик 1943-го');
ok((await cards()).includes('Шинель и берет'), 'виден в сороковых');
const g = await page.evaluate(() => window.__gens[0]);
const faceUrl = g?.messages?.[0]?.content?.find(p => p.type === 'image_url')?.image_url?.url || '';
const faceW = await page.evaluate((u) => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = u; }), faceUrl);
ok(faceW === 64, `лицо для картинки в сороковых — из рефов SLAY по облику (64 px), не 2024-е: ${faceW}`);

// общий образ, собранный в сороковых — общий внутри сороковых
await page.evaluate(() => {
    const s = SillyTavern.getContext().extensionSettings.wardrobe;
    s.items.unshift({ id: 'w1', name: 'армейское одеяло', slot: 'other', desc: '', owner: '', at: Date.now() });
});
await page.locator('.wd-lk-add').click(); await sleep(300);
await page.locator('[data-act="set-new"]').click(); await sleep(300);
await page.locator('[data-input="setname"]').fill('Блиндаж');
await page.locator('[data-input="setowner"]').selectOption('');
await page.locator('.wd-modal .wd-card[data-id="i11"]').count().then(n => ok(n === 0, 'в конструкторе нет общей пижамы 2024-го'));
await page.locator('.wd-modal .wd-card').first().click();
await page.locator('[data-act="set-save"]').click(); await sleep(400);
s = await S();
const dug = s.sets.find(x => x.name === 'Блиндаж');
ok(dug && !dug.owner && dug.era === '1943', `общий образ сороковых помнит эпоху: ${dug?.era}`);
ok(await page.locator('.wd-lk-sec.shared ~ .wd-lk-grid .wd-lk-name:has-text("Блиндаж")').count() === 1, 'виден в «Общих» у Хеди в сороковых');

console.log('— костюмер в сороковых');
await page.evaluate(() => {
    const c = SillyTavern.getContext();
    window.__calls.length = 0;
    c.chat.push({ name: 'Bucky Barnes', is_user: false, mes: 'Баки скинул шинель и натянул свитер.' });
    window.__emit('mr', c.chat.length - 1);
});
await page.waitForFunction(() => window.__calls.some(m => !String(m[0].content).includes('Разбери образ')), null, { timeout: 8000 });
// надетое — своё у чата (эпоха — у чата); проверяем именно шкаф
const shelf = await page.evaluate(() => String(window.__calls.find(m => !String(m[0].content).includes('Разбери образ'))[1].content).split('ШКАФ')[1]?.split('ПРЕДЫДУЩЕЕ')[0] || '');
if (process.env.SHOW) console.log(shelf);
ok(!/платье на халтере|лабораторный халат|клетчатая пижама/.test(shelf), 'в шкафу для костюмера нет вещей 2024-го');
ok(/шинель/.test(shelf), 'а вещи сороковых — есть');

console.log('— лицо по облику');
await page.evaluate(() => { const s = SillyTavern.getContext().extensionSettings.wardrobe; s.faces = { 'Хеди': '/samples/item_sq.jpg' }; });
await page.locator('[data-act="look-back"]').click(); await sleep(300);
await page.evaluate(() => { document.querySelector('[data-act="who"][data-name="Хеди"]')?.click(); });
await sleep(300);
await page.locator('[data-act="who-menu"]').click(); await sleep(300);
const faceItem = await page.locator('.wd-modal [data-act="face"]').innerText();
ok(/этого облика/.test(faceItem) && !/заменить/.test(faceItem), `в сороковых «Лицо для картинок» — своё у облика: «${faceItem.trim()}»`);
await page.locator('.wd-modal [data-act="face"]').click(); await sleep(300);
await page.locator('[data-input="facefile"]').setInputFiles(path.join(HERE, 'samples/oil1.png'));
await page.waitForFunction(() => Object.keys(SillyTavern.getContext().extensionSettings.wardrobe.faces).length === 2, null, { timeout: 8000 });
s = await S();
ok(s.faces['Хеди@hedy.1943'] && s.faces['Хеди'] === '/samples/item_sq.jpg', 'загруженное лицо легло на облик 1943-го, лицо 2024-го не тронуто');

console.log('— снова 2024');
await era('2024');
await page.evaluate(() => Wardrobe.open('looks', 'Хеди')); await sleep(400);
const back = await cards();
ok(!back.includes('Шинель и берет') && !back.includes('Блиндаж') && back.includes('Хеди, осень'), `в 2024 сороковых нет, своё на месте: ${back.length}`);
const life = await page.evaluate(() => Wardrobe.setsFor('Хеди').map(x => x.name));
ok(!life.includes('Шинель и берет') && life.includes('Хеди — вечер, чёрное'), 'Life (setsFor) — образы своей эпохи');

// ── 1.8.7: её скрин 23.11 — группа сороковых, «Hedy Barlow · 85 образов», все 2024-го, аватарка белая ──
console.log('— 1.8.7: снимок ядра от прошлого чата');
await page.evaluate(() => Wardrobe.open('looks', 'Хеди')); await sleep(300);
await page.evaluate(() => { window.__era = '1943'; window.__cxChat = 'chat-2024'; });   // чат уже сороковых, ядро ещё думает
await sleep(650);
await page.evaluate(() => window.__emit('chat_changed')); await sleep(300);
await page.evaluate(() => Wardrobe.open('looks', 'Хеди')); await sleep(300);
const pend = await cards();
ok(!pend.includes('Хеди, осень') && !pend.includes('Хеди — вечер, чёрное'), `пока ядро думает — образов 2024-го нет: ${pend.join(' | ') || 'пусто'}`);
ok(/определяется/.test(await page.locator('.wd-lk-era').innerText().catch(() => '')), 'и строка «эпоха чата ещё определяется»');
await page.evaluate(() => { window.__cxChat = ''; });   // ядро пересобрало снимок, события не прислало
await sleep(1600);
const after = await cards();
ok(after.includes('Шинель и берет') && !after.includes('Хеди, осень'), `ядро досчитало — сам перерисовал по эпохе: ${after.join(' | ')}`);
ok(/1943/.test(await page.locator('.wd-lk-era').innerText()), `строка эпохи: «${(await page.locator('.wd-lk-era').innerText()).trim()}»`);

console.log('— 1.8.7: персоны нет среди участников — облик персоны');
await page.evaluate(() => { window.__dropMe = true; window.__emit('sacred-timeline:changed'); }); await sleep(400);
const me = await cards();
ok(me.includes('Шинель и берет') && !me.includes('Хеди, осень'), `облик Хеди — из персоны ядра: ${me.join(' | ')}`);
await page.evaluate(() => { window.__dropMe = false; });

console.log('— 1.8.7: образ без облика и образ того, кого в чате нет');
await page.evaluate(() => {
    const s = SillyTavern.getContext().extensionSettings.wardrobe;
    s.sets.unshift({ id: 'nb1', name: 'Без облика, новый', owner: 'Хеди', itemIds: [], prompt: 'red silk dress', cat: 'Вечернее', at: Date.now() - 3600e3 });
    s.sets.unshift({ id: 'nat1', name: 'Наташа — кожанка', owner: 'Natasha Romanoff', itemIds: [], prompt: 'black leather jacket', cat: 'Повседневное', at: Date.now() - 3600e3, slice: 'nat.2024' });
    delete s.migrSlice187;
    window.__emit('sacred-timeline:changed');
});
await page.waitForFunction(() => SillyTavern.getContext().extensionSettings.wardrobe.migrSlice187 === true, null, { timeout: 5000 });
s = await S();
ok(s.sets.find(x => x.id === 'nb1')?.slice === 'hedy.2024', `своё без облика — в шкаф основной ролки: ${s.sets.find(x => x.id === 'nb1')?.slice}`);
await page.evaluate(() => Wardrobe.open('looks', '*')); await sleep(600);
const allNow = await cards();
ok(!allNow.includes('Без облика, новый') && !allNow.includes('Наташа — кожанка'), `в сороковых «✦ все»: нет ни образа без облика, ни Наташи 2024-го: ${allNow.join(' | ')}`);

console.log('— 1.8.7: аватарка по облику');
const ava = await page.locator('.wd-lk-who[data-name="Хеди"] img').getAttribute('src').catch(() => '');
s = await S();
ok(ava && ava === s.faces['Хеди@hedy.1943'] && ava !== s.faces['Хеди'], `в сороковых у Хеди — лицо облика, не 2024-го: ${ava}`);
await page.evaluate(() => { const s = SillyTavern.getContext().extensionSettings.wardrobe; window.__f43 = s.faces['Хеди@hedy.1943']; delete s.faces['Хеди@hedy.1943']; });
await page.evaluate(() => Wardrobe.open('looks', 'Хеди')); await sleep(400);
const ava2 = await page.locator('.wd-lk-who[data-name="Хеди"] img').getAttribute('src').catch(() => '');
ok(/type=persona&file=Hedy%201943\.png/.test(ava2), `своего лица у облика нет — аватар персоны эпохи: ${ava2}`);
await page.evaluate(() => { SillyTavern.getContext().extensionSettings.wardrobe.faces['Хеди@hedy.1943'] = window.__f43; });

console.log('— 1.8.7: эпоха у образа руками');
await page.evaluate(() => Wardrobe.open('looks', 'Хеди')); await sleep(400);
await page.locator('.wd-lk-card:has(.wd-lk-name:text-is("Шинель и берет")) .wd-lk-info').click(); await sleep(400);
const opts = await page.locator('.wd-modal select[data-f="slice"] option').evaluateAll(o => o.map(x => x.value));
ok(opts.includes('hedy.1943') && opts.includes('hedy.2024') && opts.includes(''), `в окне образа — выбор эпохи: ${opts.join(', ')}`);
await page.locator('.wd-modal select[data-f="slice"]').selectOption('hedy.2024');
await page.locator('.wd-modal [data-act="look-save"]').click(); await sleep(400);
s = await S();
ok(s.sets.find(x => x.name === 'Шинель и берет')?.slice === 'hedy.2024', 'образ ушёл в 2024');
ok(!(await cards()).includes('Шинель и берет'), 'и из сороковых пропал');
const line = await page.locator('.wd-lk-era').innerText();
ok(/в других эпохах/.test(line), `строка: «${line.trim()}»`);
await page.evaluate(() => { const s = SillyTavern.getContext().extensionSettings.wardrobe; s.sets.find(x => x.name === 'Шинель и берет').slice = 'hedy.1943'; });

console.log('ошибки:', errs.length ? errs : 'нет');
await b.close(); srv.kill();
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}` : '\nвсё прошло');
process.exit(fails.length ? 1 : 0);
