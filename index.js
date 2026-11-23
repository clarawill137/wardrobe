// 👗 Гардероб — шкаф вещей, комплекты и трекер «кто во что одет» для SillyTavern.
// Работает и в групповых чатах. Состояние чата хранится в метаданных чата (ветки копируют его сами),
// шкаф и комплекты — общие для всех чатов (extension_settings.wardrobe).
// Костюмер (модель через профиль подключения) после каждого сообщения смотрит, кто что снял или надел,
// и обновляет трекер. На свайпах и удалениях изменения откатываются.

import {
    SLOTS, slotOf, normSlot, isLook, uid, esc, cut, norm, clone, cleanText, extractJson,
    CLOTHES_RE, entryFromItem, newEntry, wearOutfit, stripClothes, sortBySlot, buildInjection,
    WATCHER_SYSTEM, buildWatcherInput, applyChanges, ANALYZE_SYSTEM, parseAnalyzed, parseAliases, detachItem, dedupeChars,
    matchScore, ownerWordsOf, DEFAULT_CATS, CORE_CATS, catList, matchCat, lookSystem, parseLook, catSystem, wornAll,
    galleryOf, pushImg, stepImg, dropImg, fixLookOwners, baseName,
} from './core.js';
import { STYLES, DEFAULT_MODELS, NAISTERA_MODELS, ATLAS_EDIT, atlasTakesRefs, resolveConnection, generateImage, itemPrompt, setPrompt, styleHasPerson, styleShort, styleAspect } from './draw.js';

const MODULE = 'wardrobe';
const PROMPT_KEY = 'wardrobe_state';
const VERSION = '1.8.7';

const DEFAULTS = {
    enabled: true,
    watcherOn: true,
    watcherProfile: '',
    visionProfile: '',
    effort: 'low',
    keywordsOnly: true,
    watchUser: true,
    depth: 1,
    detail: true,
    showFab: true,
    fabPos: null,
    watcherTokens: 1500,
    timeoutSec: 60,
    imgSource: 'auto',
    imgProvider: 'openrouter',
    imgKey: '',
    imgModel: '',
    imgNaisteraModel: '',
    imgAtlasModel: '',
    imgStyle: 'oil',         // образы (полные луки)
    itemStyle: 'clover',     // вещи шкафа — её «по вещам старый стиль» (1.8.3)
    imgOnPerson: 'owner',
    faces: {},
    imgStyleCustom: '',
    autoDraw: true,
    cats: DEFAULT_CATS,
    lkDrawCover: true,
    lkDrawItems: true,
    lkHair: false,
    aliases: 'Bucky Barnes = Баки, Барнс, Джеймс\nNatasha Romanoff = Наташа, Нат, Романофф\nТони Старк = Тони, Старк, Tony',
    items: [],
    sets: [],
};

const ctx = () => SillyTavern.getContext();

/**
 * Уведомление. Плашка живёт в <dialog> (верхний слой браузера), и обычные тосты таверны оказываются ПОД ней —
 * на странице образов во весь экран их совсем не видно. Поэтому, пока плашка открыта, тост показывается в ней самой.
 * msg — текст; уже экранированный HTML (с &amp; / <br>) остаётся как есть.
 */
function toast(kind, msg, title = '👗 Гардероб', opts = {}) {
    const panel = document.getElementById('wd-panel');
    if (!ui.open || !panel?.classList.contains('on')) {
        window.toastr?.[kind]?.(msg, title, opts);
        return;
    }
    const s = String(msg ?? '');
    const html = opts.escapeHtml === false || /&(amp|lt|gt|quot|#39);|<br>/.test(s) ? s : esc(s).replace(/\n/g, '<br>');
    let host = panel.querySelector('.wd-toasts');
    if (!host) { host = document.createElement('div'); host.className = 'wd-toasts'; panel.append(host); }
    const el = document.createElement('div');
    el.className = `wd-toast ${kind}`;
    el.innerHTML = `<div class="wd-toast-txt">${title ? `<b>${esc(title)}</b>` : ''}<span>${html}</span></div><button class="wd-toast-x" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>`;
    const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!e.target.closest('.wd-toast-x')) opts.onclick?.();
        kill();
    });
    host.append(el);
    while (host.children.length > 3) host.firstElementChild.remove();
    const t = opts.timeOut === 0 ? 0 : (Number(opts.timeOut) || 4000);
    if (t) setTimeout(kill, t);
}

function settings() {
    const ext = ctx().extensionSettings;
    if (!ext[MODULE]) ext[MODULE] = {};
    const s = ext[MODULE];
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = clone(v);
    if (!Array.isArray(s.items)) s.items = [];
    if (!Array.isArray(s.sets)) s.sets = [];
    if (!s.faces || typeof s.faces !== 'object') s.faces = {};
    if (!s.migr120) { if (s.imgStyle === 'sketch') s.imgStyle = 'clover'; s.migr120 = true; }
    if (!s.migr121) { if (!s.imgSource || s.imgSource === 'silly') s.imgSource = 'auto'; s.migr121 = true; }
    // 1.8: стиль картинок — масло, полуреализм (прежний запомнен: вернуть — в ⚙ или 🎨 на странице образов)
    if (!s.migr180) { if (s.imgStyle !== 'oil') s.imgStylePrev = s.imgStyle; s.imgStyle = 'oil'; s.migr180 = true; }
    // 1.8.3: вещи в шкафу — прежним стилем (что стоял до масла), образы — маслом
    if (!s.migr183) {
        const prev = s.imgStylePrev;
        s.itemStyle = prev && prev !== 'oil' && (STYLES[prev] || prev === 'custom') ? prev : 'clover';
        s.migr183 = true;
    }
    if (!Array.isArray(s.cats) || !s.cats.length) s.cats = [...DEFAULT_CATS];
    // 1.8.6: её «сделай в образах отдел тёплое» — в свой список разделов, после «Спортивного»
    if (!s.migr186) {
        if (!s.cats.some(c => norm(c) === norm('Тёплое'))) {
            const i = s.cats.findIndex(c => norm(c) === norm('Спортивное'));
            s.cats.splice(i >= 0 ? i + 1 : s.cats.length, 0, 'Тёплое');
        }
        s.migr186 = true;
    }
    return s;
}
const saveSettings = () => ctx().saveSettingsDebounced();

// ───────────── состояние чата ─────────────

function chatState() {
    const c = ctx();
    const md = c.chatMetadata;
    if (!md || (!c.chatId && !c.groupId && c.characterId === undefined)) return null;
    if (!md.wardrobe || typeof md.wardrobe !== 'object') md.wardrobe = { chars: {}, hist: [], extra: [] };
    const w = md.wardrobe;
    if (!w.chars || typeof w.chars !== 'object') w.chars = {};
    if (!Array.isArray(w.hist)) w.hist = [];
    if (!Array.isArray(w.extra)) w.extra = [];
    return w;
}

function charState(name) {
    const w = chatState();
    if (!w || !name) return null;
    if (!w.chars[name] || typeof w.chars[name] !== 'object') w.chars[name] = { worn: [], off: [] };
    const st = w.chars[name];
    if (!Array.isArray(st.worn)) st.worn = [];
    if (!Array.isArray(st.off)) st.off = [];
    return st;
}

function saveChat() {
    const c = ctx();
    try {
        if (typeof c.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
        else c.saveMetadata?.();
    } catch (e) { console.warn('[Гардероб] не сохранилось', e); }
}

/** Кто есть в сцене: ты, участники группы (или персонаж чата), добавленные руками и все, у кого уже что-то записано. */
function castNames() {
    const c = ctx();
    const names = [];
    const add = (n) => { if (n && !names.includes(n)) names.push(n); };
    add(c.name1);
    if (c.groupId) {
        const g = (c.groups || []).find(x => x.id === c.groupId);
        for (const av of g?.members || []) add((c.characters || []).find(x => x.avatar === av)?.name);
    } else if (c.characterId !== undefined && c.characters?.[c.characterId]) {
        add(c.characters[c.characterId].name);
    }
    const w = chatState();
    for (const n of w?.extra || []) add(n);
    for (const [n, st] of Object.entries(w?.chars || {})) if (st?.worn?.length || st?.off?.length) add(n);
    return names;
}

/**
 * Карточка человека по имени. У одного человека бывает несколько карточек с одним и тем же именем — эпохи
 * «Священного таймлайна», по карточке на год, — и первая по списку может оказаться из чужого года (лицо, рефы).
 * Поэтому: та, что в этом чате (если их тут несколько — та, что назвало ядро по дате: people[имя].card), иначе
 * базовая «Имя.png», иначе первая.
 */
function cardOf(name) {
    const c = ctx();
    const all = (c.characters || []).filter(x => x.name === name);
    if (all.length < 2) return all[0] || null;
    let here = [];
    if (c.groupId) {
        const g = (c.groups || []).find(x => x.id === c.groupId);
        here = all.filter(x => (g?.members || []).includes(x.avatar));
    } else if (all.includes(c.characters?.[c.characterId])) here = [c.characters[c.characterId]];
    let want = null;
    try { want = people()[name]?.card || null; } catch { /* модуль ещё грузится */ }
    return here.find(x => x.avatar === want) || here[0] || all.find(x => x.avatar === `${name}.png`) || all[0];
}

function avatarUrl(name, { preferFace = false } = {}) {
    const c = ctx();
    // 1.8.7: в другой эпохе — лицо этого облика, персона эпохи, карточка эпохи; лицо основной ролки — последним
    // (в сороковых у Хеди была белая аватарка 2024-го)
    const past = offDefault();
    if (preferFace) {
        const f = settings().faces?.[faceKey(name)] || (past ? '' : settings().faces?.[name]);
        if (f) return f;
    }
    if (name === c.name1) {
        const pa = past ? cxNow()?.persona?.avatar : '';
        if (pa) return `/thumbnail?type=persona&file=${encodeURIComponent(pa)}`;
        const img = document.querySelector('#chat .mes[is_user="true"] .avatar img');
        return img?.getAttribute('src') || (preferFace && past ? settings().faces?.[name] || '' : '');
    }
    const ch = cardOf(name);
    if (ch?.avatar) return `/thumbnail?type=avatar&file=${encodeURIComponent(ch.avatar)}`;
    return preferFace && past ? settings().faces?.[name] || '' : '';
}

// ───────────── инъекция в промпт ─────────────

function updateInjection() {
    const c = ctx();
    const s = settings();
    const w = chatState();
    const text = s.enabled && w ? buildInjection(w.chars, castNames(), { detail: s.detail }) : '';
    try {
        c.setExtensionPrompt(PROMPT_KEY, text, c.extension_prompt_types?.IN_CHAT ?? 1, Number(s.depth) || 0, false, c.extension_prompt_roles?.SYSTEM ?? 0);
    } catch (e) { console.warn('[Гардероб] инъекция', e); }
    return text;
}

/** Любая ручная правка: сохранить, обновить промпт и экран. Ручная правка — истина, старые авто-откаты сбрасываем. */
function commit({ manual = true } = {}) {
    const w = chatState();
    if (manual && w) w.hist = [];
    saveChat();
    updateInjection();
    render();
}

// ───────────── запросы к моделям ─────────────

function profiles() {
    return ctx().extensionSettings?.connectionManager?.profiles || [];
}

function findProfileId(name) {
    const p = profiles().find(x => x.name === name) || profiles().find(x => x.id === name);
    return p?.id || null;
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('таймаут')), ms))]);
}

async function ask(profileName, messages, maxTokens, minSec = 0) {
    const s = settings();
    const c = ctx();
    if (!c.ConnectionManagerRequestService?.sendRequest) throw new Error('в таверне нет Connection Manager');
    const id = profileName ? findProfileId(profileName) : null;
    if (!id) throw new Error(`выбери профиль подключения в ⚙ гардероба`);
    const override = s.effort ? { reasoning_effort: s.effort } : {};
    const r = await withTimeout(
        c.ConnectionManagerRequestService.sendRequest(id, messages, Number(maxTokens) || 1500, {}, override),
        Math.max(Number(s.timeoutSec) || 60, minSec) * 1000,
    );
    const text = typeof r === 'string' ? r : (r?.content ?? '');
    if (!String(text).trim()) throw new Error('пустой ответ модели');
    return text;
}

// ───────────── костюмер: следит за сообщениями ─────────────

let busy = false;
const queue = [];

function hashText(t) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return h;
}

function msgKey(chat, mesId) {
    const m = chat?.[mesId];
    return m ? `${mesId}:${m.swipe_id ?? 0}:${hashText(String(m.mes || ''))}` : '';
}

function setFabBusy(on) {
    document.getElementById('wd-fab')?.classList.toggle('wd-busy', !!on);
    document.querySelector('#wd-panel .wd-title')?.classList.toggle('wd-busy', !!on);
}

/** Прогнать костюмера по сообщению mesId. force — без фильтра по словам. */
async function watchMessage(mesId, { force = false } = {}) {
    const s = settings();
    const c = ctx();
    const w = chatState();
    const chat = c.chat || [];
    const m = chat[mesId];
    if (!s.enabled || !w || !m || m.is_system || m.extra?.type === 'comment') return;
    if (!force && !s.watcherOn) return;
    if (mesId !== chat.length - 1 && !force) return;
    const text = cleanText(m.mes);
    if (!text) return;
    const key = msgKey(chat, mesId);

    let h = w.hist.find(x => x.mes === mesId);
    if (h && h.keys?.includes(key) && !force) return; // уже обработано
    if (!force && s.keywordsOnly && !CLOTHES_RE.test(text)) {
        // слов про одежду нет — запоминаем, что смотрели, и ничего не меняем
        if (!h) { h = { mes: mesId, before: clone(w.chars), after: {}, keys: [] }; w.hist.push(h); }
        h.keys = [...new Set([...(h.keys || []), key])];
        h.after[m.swipe_id ?? 0] = clone(w.chars);
        trimHist(w);
        return;
    }

    const cast = castNames();
    if (h) w.chars = clone(h.before); // перегенерация того же сообщения — начинаем с состояния до него
    else { h = { mes: mesId, before: clone(w.chars), after: {}, keys: [] }; w.hist.push(h); }

    let prev = '';
    for (let i = mesId - 1; i >= 0 && !prev; i--) {
        const pm = chat[i];
        if (pm && !pm.is_system && pm.extra?.type !== 'comment') prev = cleanText(pm.mes);
    }
    const { text: input, map } = buildWatcherInput(w.chars, cast, s.items.filter(x => inEra(x, true)), { prev, message: text, speaker: m.name });

    setFabBusy(true);
    let notes = [];
    try {
        const out = await ask(s.watcherProfile, [{ role: 'system', content: WATCHER_SYSTEM }, { role: 'user', content: input }], s.watcherTokens);
        const j = extractJson(out);
        if (!j) throw new Error('костюмер ответил не JSON');
        notes = applyChanges(w.chars, j.changes || [], map, s.items, cast, parseAliases(s.aliases));
        // подстраховка: если модель всё-таки записала известную вещь как новую — склеиваем сразу
        dedupeChars(w.chars, s.items, cast, parseAliases(s.aliases));
    } catch (e) {
        console.warn('[Гардероб] костюмер:', e);
        toast('warning', String(e.message || e), '👗 Гардероб', { timeOut: 5000 });
    } finally {
        setFabBusy(false);
    }
    h.keys = [...new Set([...(h.keys || []), key])];
    h.after[m.swipe_id ?? 0] = clone(w.chars);
    trimHist(w);
    saveChat();
    updateInjection();
    render();
    if (notes.length) {
        toast('info', esc(notes.join('\n')).replace(/\n/g, '<br>'), '👗 Гардероб', { timeOut: 6000, escapeHtml: false, onclick: () => openPanel('worn') });
    }
}

function trimHist(w) {
    if (w.hist.length > 40) w.hist.splice(0, w.hist.length - 40);
}

function enqueue(mesId, opts) {
    queue.push([mesId, opts]);
    if (!busy) drain();
}

async function drain() {
    busy = true;
    try {
        while (queue.length) {
            const [id, opts] = queue.shift();
            try { await watchMessage(id, opts); } catch (e) { console.warn('[Гардероб]', e); }
        }
    } finally { busy = false; }
}

/** Свайп: вернуть состояние до этого сообщения или к уже посчитанному свайпу. */
function onSwiped(mesId) {
    const w = chatState();
    const m = ctx().chat?.[mesId];
    const h = w?.hist.find(x => x.mes === Number(mesId));
    if (!w || !h || !m) return;
    const sw = m.swipe_id ?? 0;
    w.chars = clone(h.after?.[sw] ?? h.before);
    saveChat();
    updateInjection();
    render();
}

/** Удаление сообщений: откатиться к состоянию до самого раннего удалённого. */
function onDeleted(newLen) {
    const w = chatState();
    if (!w) return;
    const len = Number(newLen);
    if (!Number.isFinite(len)) return;
    const gone = w.hist.filter(x => x.mes >= len).sort((a, b) => a.mes - b.mes);
    if (!gone.length) return;
    w.chars = clone(gone[0].before);
    w.hist = w.hist.filter(x => x.mes < len);
    saveChat();
    updateInjection();
    render();
}

function undoLast() {
    const w = chatState();
    const h = w?.hist?.length ? [...w.hist].sort((a, b) => b.mes - a.mes)[0] : null;
    if (!h) return;
    w.chars = clone(h.before);
    w.hist = w.hist.filter(x => x !== h);
    saveChat();
    updateInjection();
    render();
    toast('info', 'Вернула как было до последнего сообщения', '👗 Гардероб', { timeOut: 2500 });
}

// перехватчик генерации: твоё последнее сообщение проверяем ДО ответа бота, чтобы он уже видел новую одежду
globalThis.wardrobe_intercept = async function (chat, _contextSize, _abort, type) {
    try {
        updateInjection();
        const s = settings();
        if (!s.enabled || !s.watcherOn || !s.watchUser || type === 'quiet' || type === 'impersonate') return;
        const c = ctx();
        const full = c.chat || [];
        const lastId = full.length - 1;
        if (lastId < 0 || !full[lastId]?.is_user) return;
        await watchMessage(lastId);
    } catch (e) { console.warn('[Гардероб] перехват', e); }
};

// ───────────── картинки и разбор образов ─────────────

async function fileToDataUrl(file, max = 1024, quality = 0.86) {
    const src = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('не прочитался файл'));
        r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('это не картинка'));
        i.src = src;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k);
    cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', quality);
}

async function uploadImage(dataUrl) {
    const r = await fetch('/api/images/upload', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ image: dataUrl.split(',')[1], format: 'jpg', ch_name: 'wardrobe', filename: `wd_${Date.now()}` }),
    });
    if (!r.ok) throw new Error(`таверна не приняла картинку на сохранение (${r.status})`);
    const j = await r.json();
    const p = String(j.path || '');
    return p.startsWith('/') ? p : `/${p}`;
}

async function analyzeOutfit({ text = '', dataUrl = '' }) {
    const s = settings();
    const profile = s.visionProfile || s.watcherProfile;
    const ask1 = text ? `Описание / промпт образа:\n${text}` : 'Разложи на вещи то, что на фото.';
    const content = dataUrl
        ? [{ type: 'text', text: ask1 }, { type: 'image_url', image_url: { url: dataUrl } }]
        : ask1;
    const out = await ask(profile, [{ role: 'system', content: ANALYZE_SYSTEM }, { role: 'user', content }], 2000);
    const items = parseAnalyzed(out);
    if (!items.length) throw new Error('модель не разобрала образ (проверь, что профиль видит картинки)');
    return items;
}

// ───────────── образы: загрузка с фото или промта, разбор за кадром ─────────────

const importing = new Set();   // id образов, которые сейчас разбирает ИИ

/** Фото и/или готовый промт → { name, cat, prompt, items }. */
async function analyzeLook({ text = '', dataUrl = '', withLook = false }) {
    const s = settings();
    const profile = s.visionProfile || s.watcherProfile;
    const parts = [];
    if (text) parts.push(`Готовый промт образа:\n${cut(text, 4000)}`);
    if (dataUrl) parts.push('Фото образа — во вложении. Считай образ с фото.');
    const content = dataUrl
        ? [{ type: 'text', text: parts.join('\n\n') }, { type: 'image_url', image_url: { url: dataUrl } }]
        : parts.join('\n\n');
    const out = await ask(profile, [{ role: 'system', content: lookSystem(s.cats, withLook) }, { role: 'user', content }], 3000, 120);
    const r = parseLook(out, s.cats, withLook);
    if (!r.items.length) throw new Error(dataUrl ? 'модель не разобрала фото — проверь, что профиль для фото видит картинки' : 'модель не нашла в промте вещей');
    return r;
}

/** Вещи образа → шкаф: такая же вещь уже есть у этого владельца (или общая) — берём её, иначе кладём новую. */
function linkItems(list, owner, slice, lookId) {
    const s = settings();
    const ow = ownerWordsOf([...castNames(), owner].filter(Boolean), parseAliases(s.aliases));
    // своё — того же облика, общее — этой эпохи (вещи из других эпох не подбираем)
    const pool = s.items.filter(it => (it.owner ? it.owner === owner && (!slice || !it.slice || it.slice === slice) : inEra(it, true)));
    const ids = [];
    const created = [];
    for (const x of list) {
        let best = null, score = 0;
        for (const it of pool) {
            if (ids.includes(it.id) || normSlot(it.slot) !== normSlot(x.slot)) continue;
            const sc = matchScore(x, it, ow);
            if (sc > score) { best = it; score = sc; }
        }
        if (best && score >= 0.8) { ids.push(best.id); continue; }
        const it = addToCloset({ name: x.name, slot: x.slot, desc: x.desc, owner });
        if (slice) it.slice = slice;
        if (lookId) it.look = lookId;
        ids.push(it.id);
        created.push(it);
        pool.push(it);
    }
    return { ids, created };
}

/** Разобрать образ за кадром: вещи — в шкаф и в образ, название, раздел, промт. Потом — картинки по очереди. */
async function runImport(id, { dataUrl = '', drawCover = false, drawItems = false } = {}) {
    const s = settings();
    const set = s.sets.find(x => x.id === id);
    if (!set || importing.has(id)) return;
    importing.add(id);
    set.pending = true;
    delete set.err;
    render();
    try {
        if (!dataUrl && set.src?.img) dataUrl = await toJpeg(await urlToDataUrl(set.src.img), 1024, 0.85);
        const r = await analyzeLook({ text: set.src?.text || '', dataUrl, withLook: !!set.src?.look });
        const now = settings().sets.find(x => x.id === id);
        if (!now) return; // образ удалили, пока разбирался
        const { ids, created } = linkItems(r.items, now.owner || '', now.slice || '', id);
        now.itemIds = ids;
        if (r.prompt) now.prompt = r.prompt;
        if (!now.named && r.name) now.name = r.name;
        if (!now.cat && r.cat) now.cat = r.cat;
        delete now.pending;
        delete now.err;
        saveSettings();
        const jobs = [];
        if (drawCover && canDraw()) jobs.push({ kind: 'set', id });
        if (drawItems && canDraw()) jobs.push(...created.map(it => ({ id: it.id, ref: dataUrl || '' })));
        const drawTxt = jobs.length ? ` Рисую: ${[drawCover && canDraw() ? 'образ' : '', drawItems && created.length ? `${created.length} ${plural(created.length, 'вещь', 'вещи', 'вещей')}` : ''].filter(Boolean).join(' + ')}.` : '';
        toast('success', esc(`«${now.name}»${now.cat ? ` → ${now.cat}` : ''}: ${ids.length} ${plural(ids.length, 'вещь', 'вещи', 'вещей')}${created.length < ids.length ? ` (${ids.length - created.length} уже были в шкафу)` : ''}.${drawTxt}`), '👗 Образ разобран', { timeOut: 5000 });
        if (jobs.length) queueDraw(jobs);
    } catch (e) {
        console.warn('[Гардероб] разбор образа', e);
        const now = settings().sets.find(x => x.id === id);
        if (now) { delete now.pending; now.err = String(e?.message || e).slice(0, 220); saveSettings(); }
        toast('warning', esc(String(e?.message || e)), '👗 Образ не разобрался', { timeOut: 8000 });
    } finally {
        importing.delete(id);
        render();
    }
}

/** Образы без раздела → разделы одним запросом. Возвращает, скольким назначила. */
async function autoCategorize(list) {
    const s = settings();
    const map = {};
    const lines = list.slice(0, 60).map((set, i) => {
        const k = `l${i + 1}`;
        map[k] = set.id;
        const its = (set.itemIds || []).map(closetItem).filter(Boolean).map(it => it.name);
        return `${k}: ${set.name}${its.length ? ` — ${its.join(', ')}` : ''}${set.prompt ? ` (${cut(set.prompt, 160)})` : ''}`;
    });
    if (!lines.length) return 0;
    const out = await ask(s.watcherProfile || s.visionProfile, [{ role: 'system', content: catSystem(s.cats) }, { role: 'user', content: lines.join('\n') }], 1500, 90);
    const j = extractJson(out) || {};
    const got = j.cats && typeof j.cats === 'object' ? j.cats : j;
    let n = 0;
    for (const [k, c] of Object.entries(got || {})) {
        const set = s.sets.find(x => x.id === map[k]);
        const cat = matchCat(c, s.cats);
        if (set && cat) { set.cat = cat; n++; }
    }
    saveSettings();
    return n;
}

// ───────────── картинки вещей ─────────────

const drawing = new Set();   // id вещей и комплектов, которые сейчас рисуются
const drawQ = [];
let drawBusy = false;
let drawStop = false;

async function urlToDataUrl(u) {
    if (String(u).startsWith('data:')) return u;
    let r;
    try {
        r = await fetch(u);
    } catch (e) {
        // CDN без CORS: пробуем через <img crossOrigin>
        return await new Promise((res, rej) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
                    cv.getContext('2d').drawImage(img, 0, 0);
                    res(cv.toDataURL('image/jpeg', 0.92));
                } catch (err) { rej(new Error('картинку не дали скачать (CORS)')); }
            };
            img.onerror = () => rej(new Error('картинка не скачалась'));
            img.src = u;
        });
    }
    if (!r.ok) throw new Error(`картинка не скачалась (${r.status})`);
    const blob = await r.blob();
    return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej(new Error('картинка не прочиталась'));
        fr.readAsDataURL(blob);
    });
}

async function toJpeg(dataUrl, max = 768, q = 0.88) {
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('битая картинка'));
        i.src = dataUrl;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k);
    cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', q);
}

function imgConnection() {
    return resolveConnection(settings(), ctx().extensionSettings);
}

function canDraw() {
    return !imgConnection().error;
}

/**
 * Лицо персонажа для картинок. Порядок: своё «Лицо для картинок» в гардеробе →
 * сохранённые персонажи SLAY → рефы SLAY (по персонажам и общие) → лорбуки рефов sillyimages → аватарка.
 * Возвращает { dataUrl, from } или null.
 */
/**
 * Ключ «Лица для картинок»: в основной ролке и вне мира — имя (как было), в других эпохах — имя@облик:
 * у облика 1943-го своё лицо, не то, что загружено для 2024-го.
 */
function faceKey(name) {
    const sl = sliceNow(name);
    return offDefault() && sl ? `${name}@${sl}` : name;
}

/** base64 из лорбука рефов SLAY → data URL (тип — по первым байтам). */
const b64Url = (b) => (!b ? '' : String(b).startsWith('data:') ? String(b)
    : `data:${/^iVBOR/.test(b) ? 'image/png' : /^UklGR/.test(b) ? 'image/webp' : 'image/jpeg'};base64,${b}`);

async function personRefFor(name) {
    if (!name) return null;
    const c = ctx();
    const s = settings();
    const ext = c.extensionSettings || {};
    const al = parseAliases(s.aliases);
    const cands = [name, String(name).split(/\s+/)[0], ...(al[name] || [])].map(norm).filter(Boolean);
    const byNames = (raw) => String(raw || '').split(/[,;|/]/).map(norm).filter(Boolean)
        .some(a => cands.some(x => x === a || x.startsWith(a) || a.startsWith(x)));
    const found = [];
    const add = (path, from) => { if (path) found.push({ path, from }); };

    // другая эпоха мира: сначала то, что знает облик — своё лицо этого облика, лорбук рефов SLAY (он сам
    // выбирает облик по ядру), карточка этой эпохи; лицо, загруженное для основной ролки, — только в самом конце
    const past = offDefault();
    if (past) {
        add(s.faces?.[faceKey(name)], 'лицо этого облика');
        try {
            const rb = globalThis.slayRefBook;
            for (const e of (rb?.match?.(name) || []).slice(0, 2)) found.push({ get: async () => b64Url(await rb.image(e)), from: 'рефы SLAY по облику' });
        } catch { /* без лорбука рефов */ }
        const ch0 = cardOf(name);
        if (ch0?.avatar) add(`/characters/${encodeURIComponent(ch0.avatar)}`, 'аватарка карточки этой эпохи');
    } else add(s.faces?.[name], 'лицо из гардероба');

    const sl = ext.slay_image_gen || {};
    for (const ch of Array.isArray(sl.savedChars) ? sl.savedChars : []) {
        if (byNames(ch?.names)) add(ch.looks?.[0]?.path, 'персонажи SLAY');
    }
    const refSlots = (refs, owner) => {
        if (!refs) return;
        // в SLAY пустое имя у {{char}} = имя карточки, у {{user}} = твоя персона
        if (refs.charRef?.imagePath && (byNames(refs.charRef.name) || (!refs.charRef.name && owner && byNames(owner)))) add(refs.charRef.imagePath, 'рефы SLAY');
        if (refs.userRef?.imagePath && (byNames(refs.userRef.name) || (!refs.userRef.name && name === c.name1))) add(refs.userRef.imagePath, 'рефы SLAY');
        for (const n of refs.npcReferences || []) if (n?.imagePath && byNames(n.name)) add(n.imagePath, 'рефы SLAY (NPC)');
    };
    for (const [owner, refs] of Object.entries(sl.perCharacterRefs || {})) refSlots(refs, owner);
    refSlots(sl, '');

    for (const lb of ext.inline_image_gen?.lorebooks || []) {
        if (lb?.enabled === false) continue;
        for (const r of lb.refs || []) {
            if (!r || r.enabled === false || !r.imagePath) continue;
            let ok = false;
            if (r.useRegex) {
                try {
                    const m = String(r.name).match(/^\/(.+)\/([a-z]*)$/);
                    const re = m ? new RegExp(m[1], m[2] || 'iu') : new RegExp(String(r.name), 'iu');
                    ok = re.test(name) || cands.some(x => re.test(x));
                } catch { ok = false; }
            } else ok = byNames(r.name);
            if (ok) add(r.imagePath, 'рефы sillyimages');
        }
    }

    const ch = cardOf(name);
    if (past) add(s.faces?.[name], 'лицо из гардероба (основная ролка)');
    if (ch?.avatar) add(`/characters/${encodeURIComponent(ch.avatar)}`, 'аватарка карточки');
    else if (name === c.name1) {
        const t = avatarUrl(name);
        let f = '';
        try { f = t ? new URL(t, location.href).searchParams.get('file') || '' : ''; } catch { f = ''; }
        if (f) add(`/User Avatars/${encodeURIComponent(f)}`, 'аватарка персоны');
        else if (t) add(t, 'аватарка персоны');
    }

    for (const { path, get, from } of found) {
        try {
            const raw = get ? await get() : path;
            if (!raw) continue;
            const u = /^(\/|https?:|data:)/.test(raw) ? raw : `/${raw}`;
            return { dataUrl: await toJpeg(u.startsWith('data:') ? u : await urlToDataUrl(u), 768, 0.86), from };
        } catch { /* следующий */ }
    }
    return null;
}

/** Чья вещь: владелец, а если «общее» — тот, кто носит её в этом чате, или открытый в плашке персонаж. */
function itemWearer(it) {
    if (it?.owner) return it.owner;
    const w = chatState();
    for (const [name, st] of Object.entries(w?.chars || {})) {
        if ([...(st?.worn || []), ...(st?.off || [])].some(e => e.itemId === it.id)) return name;
    }
    return ui.tab === 'worn' ? ui.who : ui.tab === 'looks' && ui.lkWho !== '*' ? ui.lkWho : '';
}

let faceWarned = new Set();
function noteFace(name, ref) {
    if (ref || !name || faceWarned.has(name)) return;
    faceWarned.add(name);
    toast('info', `Не нашла лицо для «${esc(name)}» — нарисовала на модели. Загрузи: «На них» → ${esc(shortName(name))} → ⋮ → Лицо для картинок.`, '👗 Гардероб', { timeOut: 9000 });
}

const REF_TYPES = ['openrouter', 'gemini', 'naistera', 'atlas'];
/** Подключение берёт рефы (лицо, фото вещи): у Atlas — только модели с рефами (t2i-модели SLAY рисуют по тексту). */
const refsOk = (conn) => REF_TYPES.includes(conn.apiType) && (conn.apiType !== 'atlas' || atlasTakesRefs(conn.model));

function waitToast(sec, status) {
    toast('info', status === 429 ? `Сервис просит не так часто — жду ${sec} с и пробую снова` : `Сервис картинок сбоит — повтор через ${sec} с`, '👗 Гардероб', { timeOut: Math.min(sec, 8) * 1000 });
}

/** Настройки для картинок вещей: стиль — вещей шкафа (itemStyle), не образов. */
const itemView = (s) => ({ ...s, imgStyle: s.itemStyle || 'clover' });

/** Нарисовать картинку вещи шкафа. ref — фото-образец (data:URL), по нему рисуется именно эта вещь. */
async function drawItem(id, { ref = '' } = {}) {
    const s = itemView(settings());
    const it = closetItem(id);
    if (!it) return;
    const conn = imgConnection();
    if (conn.error) throw new Error(conn.error);
    drawing.add(id);
    paintDrawing();
    try {
        const canRef = refsOk(conn);
        const wantFace = canRef && s.imgOnPerson !== 'model' && styleHasPerson(s, it.slot);
        const who = wantFace ? itemWearer(it) : '';
        const face = wantFace ? await personRefFor(who) : null;
        if (wantFace) noteFace(who, face);
        const person = face?.dataUrl || '';
        const refs = [person, canRef ? ref : ''].filter(Boolean);
        const prompt = itemPrompt(it, s, { personRef: !!person, photoRef: !!(ref && canRef) });
        let out;
        try {
            out = await generateImage(conn, prompt, refs, { aspect: styleAspect(s, it.slot), onWait: waitToast });
        } catch (e) {
            if (person && e?.status !== 429 && (e?.status >= 500 || e?.status === 451 || /moderat|safety|celebr|policy|blocked/i.test(String(e?.message)))) {
                e.message += `\n\nПохоже, сервис отказался рисовать по лицу «${who}» (${face?.from}). Grok и Nano Banana часто блокируют лица реальных актёров. Варианты: загрузи для ${shortName(who)} арт-лицо (рисованное, не фото актёра) через ⋮ → «Лицо для картинок», или смени «Модель Naistera для вещей» в ⚙.`;
            }
            throw e;
        }
        const path = await uploadImage(await toJpeg(await urlToDataUrl(out), 900));
        pushImg(it, path);
        it.drawn = true;
        syncItemImg(it);
        saveSettings();
    } finally {
        drawing.delete(id);
        paintDrawing();
    }
}

async function drawSet(id) {
    const s = settings();
    const set = s.sets.find(x => x.id === id);
    if (!set) return;
    const conn = imgConnection();
    if (conn.error) throw new Error(conn.error);
    const its = set.itemIds.map(closetItem).filter(Boolean);
    if (!its.length && !set.prompt && !set.src?.img) throw new Error('в образе нет вещей');
    drawing.add(id);
    paintDrawing();
    try {
        const canRef = refsOk(conn);
        const wantFace = canRef && s.imgOnPerson !== 'model' && styleHasPerson(s);
        const who = set.owner || lookTarget(set) || (ui.tab === 'worn' ? ui.who : '');
        const face = wantFace ? await personRefFor(who) : null;
        if (wantFace) noteFace(who, face);
        const person = face?.dataUrl || '';
        // загруженное фото образа (импорт) — главный реф одежды; иначе — картинки вещей
        let outfit = '';
        if (canRef && set.src?.img && (ATLAS_EDIT[conn.model]?.max ?? 5) > (person ? 1 : 0)) {
            try { outfit = await toJpeg(await urlToDataUrl(set.src.img), 900, 0.86); } catch { outfit = ''; }
        }
        const itemRefs = [];
        if (canRef && !outfit) {
            for (const it of its.filter(x => x.img).slice(0, person ? 4 : 5)) {
                try { itemRefs.push(await toJpeg(await urlToDataUrl(it.img), 512, 0.85)); } catch { /* без этой картинки */ }
            }
        }
        const refs = [person, outfit, ...itemRefs].filter(Boolean);
        let out;
        try {
            out = await generateImage(conn, setPrompt(set, its, s, { itemRefs: itemRefs.length > 0, personRef: !!person, outfitRef: !!outfit }), refs, { aspect: styleAspect(s), onWait: waitToast });
        } catch (e) {
            if (person && e?.status !== 429 && (e?.status >= 500 || e?.status === 451 || /moderat|safety|celebr|policy|blocked/i.test(String(e?.message)))) {
                e.message += `\n\nПохоже, сервис отказался рисовать по лицу «${who}» (${face?.from}). Grok и Nano Banana часто блокируют лица реальных актёров — загрузи арт-лицо через ⋮ → «Лицо для картинок» или смени модель в ⚙.`;
            }
            throw e;
        }
        const live = settings().sets.find(x => x.id === id);
        if (live) pushImg(live, await uploadImage(await toJpeg(await urlToDataUrl(out), 1280)));
        saveSettings();
    } finally {
        drawing.delete(id);
        paintDrawing();
    }
}

/** Очередь рисования: по одной картинке, на первой ошибке стоп (чтобы не жечь деньги). */
function queueDraw(jobs) {
    drawQ.push(...jobs);
    if (!drawBusy) runDrawQueue();
}

async function runDrawQueue() {
    drawBusy = true;
    drawStop = false;
    let done = 0;
    try {
        while (drawQ.length && !drawStop) {
            const job = drawQ.shift();
            try {
                if (done > 0) await new Promise(r => setTimeout(r, imgConnection().apiType === 'naistera' ? 5000 : 1500)); // не долбим сервис
                if (drawStop) break;
                if (job.kind === 'set') await drawSet(job.id);
                else await drawItem(job.id, job);
                done++;
            } catch (e) {
                console.warn('[Гардероб] рисование', e);
                toast('warning', esc(String(e.message || e)).replace(/\n/g, '<br>'), '👗 Гардероб: картинка не нарисовалась', { timeOut: 0, extendedTimeOut: 0, closeButton: true, escapeHtml: false });
                drawQ.length = 0;
            }
        }
    } finally {
        drawBusy = false;
        drawQ.length = 0;
        render();
        if (done > 1) toast('success', `Нарисовано: ${done}`, '👗 Гардероб', { timeOut: 2500 });
    }
}

/** Точечно обновить картинки/спиннеры, не перерисовывая всю плашку (модалка не закрывается). */
function paintDrawing() {
    document.querySelectorAll('#wd-panel [data-draw-id]:not(.wd-lk-img)').forEach(el => {
        const id = el.dataset.drawId;
        el.classList.toggle('wd-drawing', drawing.has(id));
        const obj = imgOwner(id);
        const img = el.querySelector('img');
        if (obj?.img && (!img || img.getAttribute('src') !== obj.img)) {
            el.querySelector('span')?.remove();
            if (img) img.src = obj.img;
            else el.insertAdjacentHTML('afterbegin', `<img src="${esc(obj.img)}" alt="" loading="lazy">`);
        }
    });
    paintGallery();
    paintLooks();
    const stop = document.querySelector('#wd-panel [data-act="draw-stop"]');
    if (stop && !drawBusy) render();
}

// ───────────── операции ─────────────

function closetItem(id) { return settings().items.find(x => x.id === id); }

/** Вещь шкафа или образ по id (у них общие версии картинок). */
function imgOwner(id) { return closetItem(id) || settings().sets.find(x => x.id === id) || null; }

/** Картинка вещи сменилась — та же картинка у неё на персонажах в этом чате. */
function syncItemImg(it) {
    const w = chatState();
    let n = 0;
    for (const st of Object.values(w?.chars || {})) {
        for (const e of [...(st?.worn || []), ...(st?.off || [])]) if (e.itemId === it.id && e.img !== (it.img || '')) { e.img = it.img || ''; n++; }
    }
    if (n) saveChat();
}

// ───────────── облик (ядро «Священный таймлайн») ─────────────
// Один человек в разные эпохи — разные облики (сержант 1943-го и он же в 2024-м), и шкаф у каждого облика свой.
// Вещь и комплект помнят облик владельца (slice); в чате эпохи видно своё и общее, «Все эпохи» — всё сразу.
// Без ядра и вне мира — всё как раньше.

// Снимок ядра — только этого чата (1.8.7). После смены чата ядро пересобирает снимок не сразу (персона эпохи, память
// эпохи), а context() до тех пор отдаёт снимок прошлого чата — с ним в сороковых был шкаф 2024-го. Такой снимок — «ждём».
let cxMemo = { at: 0, v: null };
/** Снимок ядра этого чата (копия, память на полсекунды); { pending: true } — ядро ещё думает; null — ядра нет. */
function cxNow() {
    if (Date.now() - cxMemo.at < 500) return cxMemo.v;
    let cx = null;
    try { cx = globalThis.SacredTimeline?.context?.() || null; } catch { cx = null; }
    if (cx) {
        let chat = null;
        try { chat = ctx().getCurrentChatId?.() || null; } catch { chat = null; }
        if (cx.chatId && chat && String(cx.chatId) !== String(chat)) cx = { pending: true };
    }
    cxMemo = { at: Date.now(), v: cx };
    return cx;
}
/** Чат сменился или ядро прислало снимок — память долой (иначе полсекунды рисовался бы прошлый). */
function dropEraMemo() { cxMemo = { at: 0, v: null }; }
const eraPending = () => !!cxNow()?.pending;
const people = () => { const cx = cxNow(); return (cx && !cx.pending && cx.people) || {}; };

/**
 * Облик человека в этом чате: участник или персона — из снимка ядра; кого в чате нет — по дате чата из Реестра
 * (sliceAt, память на чат). undefined — ещё узнаём (перерисую сама); null — человека нет в Реестре или ядра нет;
 * { slice, label } — облик (slice: null — человек есть в Реестре, но не в этом времени).
 */
const hereMemo = new Map();
function sliceHere(name) {
    if (!name) return null;
    const cx = cxNow();
    if (!cx || cx.pending || !cx.era) return cx?.pending ? undefined : null;
    const p = cx.people?.[name];
    if (p) return p.identity ? { slice: p.slice || null, label: p.label || '', identity: p.identity } : null;
    let me = '';
    try { me = ctx().name1 || ''; } catch { me = ''; }
    if (name === me && cx.persona?.slice) return { slice: cx.persona.slice, label: '', identity: cx.persona.identity || '' };
    const key = `${cx.chatId || ''}|${cx.date || cx.era.from || ''}|${name}`;
    if (hereMemo.has(key)) { const v = hereMemo.get(key); return v === 'wait' ? undefined : v; }
    const api = globalThis.SacredTimeline;
    if (typeof api?.sliceAt !== 'function') return null;
    hereMemo.set(key, 'wait');
    Promise.resolve(api.sliceAt(name, cx.date || cx.era.from || '')).then(
        (r) => hereMemo.set(key, r?.identity ? { slice: r.slice || null, label: r.label || '', identity: r.identity } : null),
        () => hereMemo.set(key, null),
    ).finally(() => { if (ui.open) render(); });
    return undefined;
}
const sliceNow = (name) => sliceHere(name)?.slice || null;
const sliceLabel = (name) => sliceHere(name)?.label || '';

// с этого дня в мире есть эпохи; всё, что легло в шкаф раньше, — из основной ролки
const EPOCHS = Date.parse('2026-11-07T00:00:00Z');

/** Эпоха этого чата и эпоха мира по умолчанию (основная ролка) — по ядру; без ядра, вне мира или пока ядро думает — ''. */
function eraIds() {
    const cx = cxNow();
    return cx && !cx.pending ? { cur: String(cx.era?.id || ''), def: String(cx.world?.defaultEra || '') } : { cur: '', def: '' };
}
const eraNow = () => eraIds().cur;
/** Чат — не в основной ролке, а в другой эпохе мира (1943, 2013, 2014…). */
const offDefault = () => { const e = eraIds(); return !!e.cur && !!e.def && e.cur !== e.def; };
/** Когда вещь или образ появились: at, иначе — время из id (uid начинается с Date.now()). 0 — не знаем. */
function bornAt(x) {
    if (x?.at) return Number(x.at) || 0;
    const t = parseInt(String(x?.id || '').slice(0, -6), 36);
    return t > 1.5e12 && t < 4e12 ? t : 0;
}
/** Эпоха общей (ничьей) вещи: своя метка; старое, до эпох, — основной ролки; новое без метки — видно везде. */
function sharedEra(x) {
    if (x?.era) return String(x.era);
    const t = bornAt(x);
    return !t || t < EPOCHS ? eraIds().def : '';
}

/**
 * Видно ли вещь (образ) в этом чате. Своё — по облику владельца (облик 1943-го ≠ он же в 2024-м; владельца нет в чате —
 * его облик на дату чата); общее — общее внутри эпохи (пижама 2024-го не всплывает в сороковых). «Все эпохи» — всё.
 * strict — без «Все эпохи» (для модели). Пока ядро не пересобрало снимок после смены чата — помеченное эпохой не видно.
 */
function inEra(x, strict = false) {
    if (!x || (!strict && ui.allEras)) return true;
    const cx = cxNow();
    if (!cx) return true;
    if (cx.pending) return !x.slice && !x.era;
    if (!cx.era) return true;   // чат вне мира — всё как раньше
    if (!x.owner) {
        const cur = eraNow();
        const e = cur ? sharedEra(x) : '';
        return !cur || !e || e === cur;
    }
    const h = sliceHere(x.owner);
    if (h === undefined) return !x.slice;   // облик владельца ещё узнаём — помеченное покажу, когда узнаю
    if (h === null) return true;            // человека нет в Реестре — его вещи не делятся по эпохам
    if (!x.slice) return h.slice != null;   // без облика: там, где человек есть
    return h.slice === x.slice;
}
const eraOn = () => { const cx = cxNow(); return !!cx && (!!cx.pending || !!cx.era); };

/** Владелец сменился — облик (или эпоха общего) под нового. */
function retag(x, owner) {
    if (owner) {
        delete x.era;
        const h = sliceHere(owner);
        if (h?.slice) x.slice = h.slice; else delete x.slice;
        if (h === undefined) sliceLater(x, owner);   // ядро ещё не ответило — облик допишу, как узнаю
    } else {
        delete x.slice;
        const e = eraNow();
        if (e) x.era = e; else delete x.era;
    }
}

/** Облик владельца, когда ядро его ещё не знало (свежий чат, человек не из чата): по дате чата из Реестра. */
async function sliceLater(x, owner) {
    const api = globalThis.SacredTimeline;
    if (typeof api?.sliceAt !== 'function') return;
    for (let i = 0; i < 20 && eraPending(); i++) await new Promise(r => setTimeout(r, 500));
    const cx = cxNow();
    if (!cx || cx.pending || !cx.era) return;
    const r = await Promise.resolve(api.sliceAt(owner, cx.date || cx.era.from || '')).catch(() => null);
    if (r?.slice && x.owner === owner && !x.slice) { x.slice = r.slice; saveSettings(); if (ui.open) render(); }
}

function addToCloset({ name, slot, desc = '', img = '', owner = '' }) {
    const it = { id: uid(), name: cut(name, 80) || 'вещь', slot: normSlot(slot), desc: String(desc || '').trim(), img, owner, at: Date.now() };
    retag(it, owner);
    settings().items.unshift(it);
    saveSettings();
    return it;
}

/** Облик человека в эпохе мира по умолчанию (основная ролка) — для старых вещей и образов. null — ядра нет. */
let baseMemo = { map: null, at: 0, slices: new Map() };
/** Начало эпохи мира по умолчанию (ядро: chronograph) или '' — ядра нет / ещё не готово. */
async function baseDate() {
    const api = globalThis.SacredTimeline;
    if (typeof api?.sliceAt !== 'function' || typeof api?.chronograph !== 'function') return '';
    if (!baseMemo.map || Date.now() - baseMemo.at > 60000) {
        baseMemo = { map: await api.chronograph().catch(() => null), at: Date.now(), slices: new Map() };
    }
    const map = baseMemo.map;
    return String(map?.eras?.find(e => e.id === map.defaultEra)?.from || '');
}
/** { identity, slice } человека в основной ролке (память на минуту). */
async function baseOf(owner) {
    const base = owner ? await baseDate() : '';
    if (!base) return null;
    if (!baseMemo.slices.has(owner)) baseMemo.slices.set(owner, (await globalThis.SacredTimeline.sliceAt(owner, base).catch(() => null)) || null);
    return baseMemo.slices.get(owner);
}
async function baseSlice(owner) { return (await baseOf(owner))?.slice || null; }

/**
 * Старые вещи и образы — шкаф основной ролки: облик владельца в эпохе мира по умолчанию. Один раз
 * (1.8.2 — ещё раз: образы, которым владельца нашёл разбор 1.8.1, облика не получили).
 */
let migrBusy = false;
async function migrateSlices() {
    const s = settings();
    const api = globalThis.SacredTimeline;
    if (!s.migrSlice182) { s.migrSlice = false; s.migrSlice182 = true; }
    if (migrBusy || typeof api?.sliceAt !== 'function' || typeof api?.chronograph !== 'function') return;
    if (s.migrSlice) return migrateSliceless();
    migrBusy = true;
    try {
        if (!(await baseDate())) return; // ядро ещё не готово — в следующий раз
        // облики каждой личности из Реестра: чужой облик у вещи — след разбора владельцев 1.8.1 (владелец сменился, облик остался)
        const reg = await api.registry?.().catch(() => null);
        const own = new Map();
        for (const e of Object.values(reg?.entries || {})) {
            const g = e?.gc;
            if (g?.type === 'identity' && g.id) own.set(g.id, new Set((g.slices || []).map(x => x.id)));
        }
        let n = 0;
        for (const x of [...s.items, ...s.sets]) {
            if (!x.owner) continue;
            const b = await baseOf(x.owner);
            const mine = b?.identity ? own.get(b.identity) : null;
            if (x.slice && !(mine && !mine.has(x.slice))) continue;
            const t = bornAt(x);
            let sl = null;
            if (!t || t < EPOCHS) sl = b?.slice || null;
            else if (x.itemIds) {
                // новый образ с чужим обликом: облик его вещей того же владельца, иначе — основная ролка
                const its = x.itemIds.map(id => s.items.find(i => i.id === id)).filter(i => i?.owner === x.owner && i.slice && (!mine || mine.has(i.slice)));
                sl = its[0]?.slice || b?.slice || null;
            } else if (x.slice) sl = b?.slice || null;
            else continue; // новая вещь без облика (ядра не было) — общая для всех обликов владельца, как и раньше
            if (sl && sl !== x.slice) { x.slice = sl; n++; } else if (!sl && x.slice) { delete x.slice; n++; }
        }
        s.migrSlice = true;
        saveSettings();
        if (n) { console.log(`[Гардероб] облики: шкаф основной ролки и чужие облики поправлены (${n})`); if (ui.open) render(); }
    } finally { migrBusy = false; }
    await migrateSliceless();
}

/**
 * 1.8.7: своё без облика — шкаф основной ролки (как старое до эпох). Без облика вещь и образ оставались, когда ядро не
 * называло облик владельца в момент записи (снимок прошлого чата, владелец не из чата) — и такие видно было во всех
 * эпохах: в сороковых — образы Хеди 2024-го. У кого облика в основной ролке нет (Стив, Пегги…) — как было.
 */
let migrBusy2 = false;
async function migrateSliceless() {
    const s = settings();
    const api = globalThis.SacredTimeline;
    if (migrBusy2 || s.migrSlice187 || !s.migrSlice || typeof api?.sliceAt !== 'function') return;
    migrBusy2 = true;
    try {
        if (!(await baseDate())) return;
        let n = 0;
        for (const x of [...s.items, ...s.sets]) {
            if (!x.owner || x.slice) continue;
            const sl = await baseSlice(x.owner);
            if (sl) { x.slice = sl; n++; }
        }
        s.migrSlice187 = true;
        saveSettings();
        if (n) { console.log(`[Гардероб] облики: своё без облика — в шкаф основной ролки (${n})`); if (ui.open) render(); }
    } finally { migrBusy2 = false; }
}

/** Образу дали владельца (разбор 1.8.1 или руками) — облик: старому — основной ролки, новому — нынешний. */
async function sliceForOwner(set, owner) {
    delete set.era;
    const t = bornAt(set);
    const sl = !t || t < EPOCHS ? await baseSlice(owner) : sliceNow(owner);
    if (sl) set.slice = sl;
    else { delete set.slice; if (t >= EPOCHS && sliceHere(owner) === undefined) sliceLater(set, owner); }
}

function wearItem(who, it) {
    const st = charState(who);
    if (!st || !it) return;
    if (st.worn.some(e => e.itemId && e.itemId === it.id)) return;
    // вещь одна: если она у кого-то (надета или лежит рядом, в т.ч. у себя) — переходит, а не копируется
    st.worn.push(detachItem(chatState()?.chars, it.id, st.worn) || entryFromItem(it));
}

function findEntry(who, entryUid) {
    const st = charState(who);
    if (!st) return null;
    for (const list of ['worn', 'off']) {
        const i = st[list].findIndex(e => e.uid === entryUid);
        if (i >= 0) return { st, list, i, e: st[list][i] };
    }
    return null;
}

/** Надеть один или несколько комплектов: заменяются только вещи тех же типов, 📌 остаётся. */
function applySets(who, sets, { replaceAll = false } = {}) {
    const st = charState(who);
    if (!st) return;
    const items = [];
    for (const set of sets) for (const id of set?.itemIds || []) items.push(closetItem(id));
    const chars = chatState()?.chars || {};
    for (const it of items) {
        if (!it || st.worn.some(e => e.itemId === it.id) || st.off.some(e => e.itemId === it.id)) continue;
        for (const [other, ost] of Object.entries(chars)) if (other !== who && ost) for (const list of ['worn', 'off']) {
            const i = (ost[list] || []).findIndex(e => e.itemId === it.id);
            if (i >= 0) ost[list].splice(i, 1);
        }
    }
    wearOutfit(st, items.filter(Boolean), { replaceAll });
}

/** Закрепить/открепить вещь: на персонаже и в шкафу (чтобы в следующий раз надевалась уже закреплённой). */
function setPinned(entryOrItemId, on) {
    const it = closetItem(entryOrItemId);
    if (it) { if (on) it.pinned = true; else delete it.pinned; saveSettings(); }
    const w = chatState();
    for (const st of Object.values(w?.chars || {})) {
        for (const e of [...(st?.worn || []), ...(st?.off || [])]) {
            if (e.itemId === entryOrItemId || e.uid === entryOrItemId) { if (on) e.pinned = true; else delete e.pinned; }
        }
    }
}

// ───────────── интерфейс ─────────────

// lkWho — чьи образы на странице коллекции ('*' — все), lkCat — раздел ('all', 'new', 'none' или название)
const ui = { open: false, tab: 'worn', who: '', q: '', slot: 'all', owner: 'all', draft: null, allEras: false, lkWho: '', lkCat: 'all', prevTab: 'worn', shownTab: '' };

function profileOptions(selected, empty = '— выбери профиль —') {
    return `<option value="">${esc(empty)}</option>`
        + profiles().map(p => `<option value="${esc(p.name)}" ${p.name === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

function thumb(e, cls = 'wd-thumb') {
    const sl = slotOf(e.slot);
    const did = e.itemId || e.id || '';
    return `<div class="${cls}${drawing.has(did) ? ' wd-drawing' : ''}" data-slot="${esc(sl.k)}" data-draw-id="${esc(did)}">${e.img ? `<img src="${esc(e.img)}" alt="" loading="lazy">` : `<span>${sl.i}</span>`}</div>`;
}

function avatar(name, size = '') {
    const url = avatarUrl(name, { preferFace: true });
    const letter = esc((name || '?').trim().charAt(0).toUpperCase());
    return `<div class="wd-ava ${size}">${url ? `<img src="${esc(url)}" alt="" onerror="this.remove()">` : ''}<span>${letter}</span></div>`;
}

function shortName(n) {
    const first = String(n || '').split(/\s+/)[0];
    return first.length > 10 ? first.slice(0, 9) + '…' : first;
}

function renderPeople(names) {
    return `<div class="wd-people">${names.map(n => `
        <button class="wd-person ${n === ui.who ? 'on' : ''}" data-act="who" data-name="${esc(n)}" title="${esc(n)}">
            ${avatar(n)}<span>${esc(shortName(n))}</span>
        </button>`).join('')}
        <button class="wd-person wd-person-add" data-act="add-person" title="Добавить персонажа в сцену">
            <div class="wd-ava"><i class="fa-solid fa-user-plus"></i></div><span>ещё</span>
        </button>
    </div>`;
}

function entryRow(e, list) {
    const sl = slotOf(e.slot);
    const meta = [sl.t, e.state ? `<b class="wd-state">${esc(e.state)}</b>` : ''].filter(Boolean).join(' · ');
    const look = isLook(sl.k);
    const action = list === 'worn'
        ? `<button class="wd-mini" data-act="takeoff" data-uid="${esc(e.uid)}" title="Снять"><i class="fa-solid fa-arrow-down"></i><span>${look ? (sl.k === 'makeup' ? 'смыть' : 'убрать') : 'снять'}</span></button>`
        : `<button class="wd-mini" data-act="puton" data-uid="${esc(e.uid)}" title="Надеть"><i class="fa-solid fa-arrow-up"></i><span>${look ? 'вернуть' : 'надеть'}</span></button>`;
    return `<div class="wd-row ${list === 'off' ? 'is-off' : ''}">
        ${thumb(e)}
        <div class="wd-row-main" data-act="entry-menu" data-uid="${esc(e.uid)}">
            <div class="wd-row-name">${e.pinned ? '<span class="wd-pin" title="Закреплено: не снимается при смене комплекта">📌</span>' : ''}${esc(e.name)}${e.itemId ? '' : ' <i class="wd-new" title="Нет в шкафу">новое</i>'}</div>
            <div class="wd-row-meta">${meta}</div>
            ${e.desc ? `<div class="wd-row-desc">${esc(cut(e.desc, 110))}</div>` : ''}
        </div>
        ${action}
        <button class="wd-dots" data-act="entry-menu" data-uid="${esc(e.uid)}" title="Ещё"><i class="fa-solid fa-ellipsis"></i></button>
    </div>`;
}

function renderWorn() {
    const w = chatState();
    if (!w) return `<div class="wd-empty"><div class="wd-empty-ico">🪞</div>Открой чат — тогда будет кого одевать.</div>`;
    const names = castNames();
    if (!ui.who || !names.includes(ui.who)) ui.who = names.find(n => n !== ctx().name1) || names[0] || '';
    const st = charState(ui.who);
    if (!st) return `<div class="wd-empty"><div class="wd-empty-ico">🪞</div>В сцене пока никого.</div>`;
    const worn = sortBySlot(st.worn);
    const off = st.off;
    const s = settings();
    const hint = !s.watcherProfile && s.watcherOn
        ? `<div class="wd-hint" data-act="tab" data-tab="cfg"><i class="fa-solid fa-circle-info"></i> Выбери профиль костюмера в ⚙ — тогда он сам будет замечать, кто что снял.</div>` : '';
    return `${renderPeople(names)}${hint}
    <div class="wd-hero">
        ${avatar(ui.who, 'big')}
        <div class="wd-hero-txt">
            <div class="wd-hero-name">${esc(ui.who)}</div>
            <div class="wd-hero-sub">${worn.length ? `надето: ${worn.length} ${plural(worn.length, 'вещь', 'вещи', 'вещей')}` : off.length ? 'ничего не надето' : 'пока ничего не записано'}${off.length ? ` · ${off.length} снято` : ''}</div>
        </div>
        <button class="wd-btn icon" data-act="who-menu" title="Ещё"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>
    <div class="wd-actions-row">
        <button class="wd-btn primary" data-act="pick-closet"><i class="fa-solid fa-box-archive"></i> Из шкафа</button>
        <button class="wd-btn" data-act="new-item"><i class="fa-solid fa-wand-magic-sparkles"></i> Новое</button>
        <button class="wd-btn" data-act="pick-set"><i class="fa-solid fa-layer-group"></i> Образы</button>
    </div>
    <div class="wd-sec">Надето</div>
    ${worn.length ? `<div class="wd-list">${worn.map(e => entryRow(e, 'worn')).join('')}</div>`
        : `<div class="wd-empty small">${off.length ? 'Всё снято 🫣' : 'Пусто. Достань вещи из шкафа или добавь новые.'}</div>`}
    ${off.length ? `<div class="wd-sec">Снято, лежит рядом <button class="wd-link" data-act="clear-off">убрать всё</button></div>
        <div class="wd-list">${off.map(e => entryRow(e, 'off')).join('')}</div>` : ''}
    ${w.hist.length ? `<button class="wd-link wd-undo" data-act="undo"><i class="fa-solid fa-rotate-left"></i> откатить последнее авто-изменение</button>` : ''}`;
}

function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
}

function ownersList() {
    const set = new Set(castNames());
    for (const it of settings().items) if (it.owner) set.add(it.owner);
    return [...set];
}

function filteredItems() {
    const q = norm(ui.q);
    return settings().items.filter(it => inEra(it)
        && (ui.slot === 'all' || it.slot === ui.slot)
        && (ui.owner === 'all' || (ui.owner === '' ? !it.owner : it.owner === ui.owner))
        && (!q || norm(`${it.name} ${it.desc} ${it.owner}`).includes(q)));
}

function closetFilters() {
    const used = new Set(settings().items.map(i => i.slot));
    const chips = [{ k: 'all', t: 'Всё', i: '🗂' }, ...SLOTS.filter(sl => used.has(sl.k))];
    return `<div class="wd-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Поиск по шкафу" value="${esc(ui.q)}" data-input="q"></div>
    <div class="wd-chips">${chips.map(sl => `<button class="wd-chip ${ui.slot === sl.k ? 'on' : ''}" data-act="slot" data-slot="${sl.k}">${sl.i} ${esc(sl.t)}</button>`).join('')}</div>
    <div class="wd-chips">
        <button class="wd-chip ${ui.owner === 'all' ? 'on' : ''}" data-act="owner" data-owner="all">все</button>
        <button class="wd-chip ${ui.owner === '' ? 'on' : ''}" data-act="owner" data-owner="">общее</button>
        ${ownersList().map(o => `<button class="wd-chip ${ui.owner === o ? 'on' : ''}" data-act="owner" data-owner="${esc(o)}">${esc(shortName(o))}</button>`).join('')}
    </div>
    ${eraOn() ? `<div class="wd-chips"><button class="wd-chip ${ui.allEras ? 'on' : ''}" data-act="all-eras">🕰 Все эпохи</button>
        <span class="wd-hint-soft">${ui.allEras ? 'видно вещи всех обликов' : `шкаф этой эпохи${ui.owner && ui.owner !== 'all' && sliceLabel(ui.owner) ? ` — ${esc(cut(sliceLabel(ui.owner), 60))}` : ''}`}</span></div>` : ''}`;
}

function itemCard(it, act = 'item-menu') {
    const sl = slotOf(it.slot);
    return `<button class="wd-card" data-act="${act}" data-id="${esc(it.id)}">
        ${thumb(it, 'wd-card-img')}
        <div class="wd-card-name">${it.pinned ? '📌 ' : ''}${esc(it.name)}</div>
        <div class="wd-card-meta">${sl.i} ${esc(sl.t)}${it.owner ? ` · ${esc(shortName(it.owner))}` : ''}</div>
    </button>`;
}

function renderCloset() {
    const items = filteredItems();
    const missing = settings().items.filter(it => !it.img).length;
    const drawBtn = drawBusy
        ? `<button class="wd-btn danger" data-act="draw-stop"><i class="fa-solid fa-stop"></i> Стоп (${drawQ.length + 1})</button>`
        : missing ? `<button class="wd-btn" data-act="draw-missing"><i class="fa-solid fa-palette"></i> Дорисовать (${missing})</button>` : '';
    const filtered = ui.slot !== 'all' || ui.owner !== 'all' || ui.q;
    const redrawBtn = !drawBusy && filtered && items.length
        ? `<button class="wd-btn" data-act="draw-shown"><i class="fa-solid fa-rotate"></i> Перерисовать показанные (${items.length})</button>` : '';
    return `<div class="wd-actions-row">
        <button class="wd-btn primary" data-act="new-item"><i class="fa-solid fa-plus"></i> Новая вещь или образ</button>
        ${drawBtn}${redrawBtn}
    </div>
    ${closetFilters()}
    ${items.length ? `<div class="wd-grid">${items.map(it => itemCard(it)).join('')}</div>`
        : `<div class="wd-empty"><div class="wd-empty-ico">🧺</div>${settings().items.length ? 'Ничего не нашлось.' : 'Шкаф пустой. Добавь вещь текстом, промптом образа или фоткой — ИИ разложит на вещи.'}</div>`}`;
}

// ───── коллекция образов: страница на весь экран (1.8) ─────
// Сверху — кнопка на каждого персонажа и «✦ все», под ними разделы (Офис, Вечернее, Спортивное…),
// дальше — карточки образов в две колонки: картинка целиком, «Надеть», ⧉ промт, 👕 что внутри.

const NEW_DAYS = 14;
const isNewLook = (set) => !!set.at && Date.now() - set.at < NEW_DAYS * 864e5;
const catKey = (c) => norm(c);
const CAT_ICON = { 'повседневное': '👟', 'офис': '💼', 'вечернее': '🥂', 'спортивное': '🏃', 'теплое': '🧣', 'дом и сон': '🌙', 'белье': '🩱', 'миссия': '🎯' };
const catIcon = (c) => CAT_ICON[catKey(c)] || '🏷';

/** Чьи образы бывают: сцена (кроме тебя, если у тебя пусто) + владельцы образов. */
function lookOwners() {
    const out = [];
    const add = (n) => { if (n && !out.includes(n)) out.push(n); };
    const sets = settings().sets.filter(x => inEra(x));
    const me = ctx().name1;
    for (const n of castNames()) if (n !== me || sets.some(x => x.owner === n)) add(n);
    for (const set of sets) add(set.owner);
    if (ui.lkWho && ui.lkWho !== '*') add(ui.lkWho);
    return out;
}

/** На кого надевать образ со страницы: выбранный персонаж, а в «✦ все» — владелец образа. */
function lookTarget(set) {
    if (ui.lkWho && ui.lkWho !== '*') return ui.lkWho;
    return set?.owner || '';
}

function lookWornBy(set, who) {
    const st = who ? chatState()?.chars?.[who] : null;
    return !!st && wornAll(st, set);
}

/** Образы на странице: выбранного персонажа (только его) или все. */
function looksShown() {
    const list = settings().sets.filter(x => inEra(x));
    if (!ui.lkWho || ui.lkWho === '*') return list;
    return list.filter(x => x.owner === ui.lkWho);
}

/** Общие образы (без владельца) — у персонажа отдельным блоком внизу, не в его разделах. */
function looksShared() {
    if (!ui.lkWho || ui.lkWho === '*') return [];
    return settings().sets.filter(x => inEra(x) && !x.owner);
}

/** Кто вообще может владеть образом: ты, сцена, все карточки, владельцы вещей и образов, прозвища. */
function ownerCandidates() {
    const s = settings();
    const c = ctx();
    const out = [];
    const add = (n) => { if (n && !out.includes(n)) out.push(n); };
    add(c.name1);
    castNames().forEach(add);
    (c.characters || []).forEach(x => add(x?.name));
    s.sets.forEach(x => add(x.owner));
    s.items.forEach(x => add(x.owner));
    Object.keys(s.faces || {}).forEach(add);
    Object.keys(parseAliases(s.aliases)).forEach(add);
    const n = (name) => s.sets.filter(x => x.owner === name).length + s.items.filter(x => x.owner === name).length;
    const cast = castNames();
    const prefer = [...cast, ...out.filter(x => !cast.includes(x)).sort((a, b) => n(b) - n(a))];
    return { list: out, prefer };
}

/**
 * Разобрать владельцев образов: «общий» с «Хеди, …» в названии или с вещами Хеди — Хеди; «Хеди — дома» у Баки
 * с не его вещами — Хеди. Совсем непонятные остаются общими. Возвращает, кого куда переложила.
 */
async function runOwnerFix() {
    const s = settings();
    const { list, prefer } = ownerCandidates();
    const moved = fixLookOwners(s.sets, s.items, list, parseAliases(s.aliases), prefer);
    // облик: старые — шкаф основной ролки, новые — нынешний облик; иначе 2024-й образ всплыл бы в сороковых
    for (const m of moved) await sliceForOwner(m.set, m.to).catch(() => null);
    if (moved.length) saveSettings();
    return moved;
}

function ownerFixText(moved) {
    const by = {};
    for (const m of moved) by[m.to] = (by[m.to] || 0) + 1;
    const left = settings().sets.filter(x => !x.owner).length;
    return `${Object.entries(by).map(([n, k]) => `${shortName(n)} — ${k}`).join(', ')}.${left ? ` Общими остались ${left}: их можно отдать тапом по «общий».` : ''}`;
}

/** Чей образ — выбор тапом по плашке «общий» / имени на карточке. */
function ownerPickModal(id) {
    const set = settings().sets.find(x => x.id === id);
    if (!set) return;
    const names = [...new Set([...lookOwners(), ...ownersList()])].filter(Boolean);
    openModal(`Чей образ «${esc(cut(set.name, 34))}»?`, `
        <div class="wd-people wrap">${names.map(n => `
            <button class="wd-person ${n === set.owner ? 'on' : ''}" data-act="look-owner-set" data-id="${esc(id)}" data-name="${esc(n)}">${avatar(n)}<span>${esc(shortName(n))}</span></button>`).join('')}
            <button class="wd-person ${!set.owner ? 'on' : ''}" data-act="look-owner-set" data-id="${esc(id)}" data-name=""><span class="wd-ava wd-ava-all">✦</span><span>общий</span></button>
        </div>
        <div class="wd-hint-soft">Общий образ виден у всех внизу страницы, в «Общих», а не в разделах персонажа.</div>`);
}

function looksIn(list, cat) {
    if (cat === 'all') return list;
    if (cat === 'new') return list.filter(isNewLook);
    if (cat === 'none') return list.filter(x => !x.cat);
    return list.filter(x => x.cat && catKey(x.cat) === catKey(cat));
}

/** Разделы этого персонажа: её три — всегда, остальные — если в них что-то есть; свои разделы образов — тоже. */
function lookCats(list) {
    const s = settings();
    const out = [];
    const add = (c) => { if (c && !out.some(x => catKey(x) === catKey(c))) out.push(c); };
    for (const c of s.cats) if (CORE_CATS.some(k => catKey(k) === catKey(c)) || list.some(x => x.cat && catKey(x.cat) === catKey(c))) add(c);
    for (const x of list) if (x.cat) add(x.cat);
    return out;
}

/** Что копирует ⧉: промт образа, а если его нет — состав по вещам. */
function lookPromptText(set) {
    if (set.prompt) return set.prompt;
    const its = (set.itemIds || []).map(closetItem).filter(Boolean);
    return its.length ? `${set.name}: ${its.map(it => `${it.name}${it.desc ? ` (${cut(it.desc, 140)})` : ''}`).join('; ')}` : set.name;
}

/** Картинка образа: обложка, а без неё — плитки его вещей (картинка или значок) и «нарисовать». */
function lookImgHtml(set) {
    const img = set.img;
    const fit = `onload="this.parentNode.classList.add(Math.abs(this.naturalWidth/this.naturalHeight-0.667)<0.07?'wd-fit':'wd-odd')"`;
    if (img) return `<img class="wd-lk-bg" src="${esc(img)}" alt="" aria-hidden="true"><img class="wd-lk-fg" src="${esc(img)}" alt="" loading="lazy" ${fit}>`;
    const its = (set.itemIds || []).map(closetItem).filter(Boolean).slice(0, 4);
    const tiles = its.length
        ? `<div class="wd-lk-tiles n${its.length}">${its.map(it => `<span>${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : slotOf(it.slot).i}</span>`).join('')}</div>`
        : `<div class="wd-lk-ph-ico">${set.cat ? catIcon(set.cat) : '🎽'}</div>`;
    return `<div class="wd-lk-ph">${tiles}${set.pending ? '' : '<small><i class="fa-solid fa-palette"></i> нарисовать образ</small>'}</div>`;
}

/** Плашка владельца на карточке: тап — выбрать, чей образ. */
const ownerChip = (id, txt) => `<button class="wd-lk-owner" data-act="look-owner" data-id="${id}" title="Чей образ — сменить">${txt}<i class="fa-solid fa-caret-down"></i></button>`;

function lookCard(set) {
    const id = esc(set.id);
    const gal = galleryOf(set);
    const who = lookTarget(set);
    const on = !!who && lookWornBy(set, who);
    const busy = !!set.pending && importing.has(set.id);
    const err = set.err || (set.pending && !importing.has(set.id) ? 'разбор прервался' : '');
    const empty = !(set.itemIds || []).length;
    const inner = `
        <div class="wd-lk-img${set.img ? '' : ' wd-noimg'}${drawing.has(set.id) ? ' wd-drawing' : ''}" data-act="look-open" data-id="${id}" data-draw-id="${id}" data-gal="${gal.length}">${lookImgHtml(set)}</div>
        <button class="wd-lk-info" data-act="look-open" data-id="${id}" title="Что в образе"><i class="fa-solid fa-shirt"></i></button>
        ${gal.length > 1 ? `<div class="wd-lk-dots">${gal.slice(-6).map(g => `<i class="${g === set.img ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        ${on ? '<div class="wd-lk-badge"><i class="fa-solid fa-check"></i> надето</div>'
        : ui.lkWho === '*' && set.owner ? ownerChip(id, esc(shortName(set.owner)))
            : !set.owner ? ownerChip(id, 'общий') : ''}
        ${busy ? '<div class="wd-lk-busy"><span class="wd-lk-spin"></span>ИИ разбирает образ…</div>' : ''}
        ${err && !busy ? `<button class="wd-lk-err" data-act="look-retry" data-id="${id}"><i class="fa-solid fa-rotate-right"></i> ${esc(cut(err, 46))}</button>` : ''}
        <div class="wd-lk-foot">
            <div class="wd-lk-name">${esc(set.name)}</div>
            <div class="wd-lk-btns">
                <button class="wd-lk-wear${on ? ' on' : ''}" data-act="look-wear" data-id="${id}" ${busy || empty ? 'disabled' : ''}>${on ? '<i class="fa-solid fa-check"></i> Надето' : 'Надеть'}</button>
                <button class="wd-lk-copy" data-act="look-copy" data-id="${id}" title="Скопировать промт" ${busy ? 'disabled' : ''}><i class="fa-solid fa-copy"></i></button>
            </div>
        </div>`;
    return `<div class="wd-lk-card${on ? ' on' : ''}" data-id="${id}" data-key="${hashText(inner)}">${inner}</div>`;
}

const lookGrid = (list) => `<div class="wd-lk-grid">${list.map(lookCard).join('')}</div>`;

function renderLooks() {
    const s = settings();
    if (!regIds && eraOn()) regLoad();   // облики владельцев — для выбора эпохи в окне образа
    // 1.8.1: старые комплекты без владельца (прежний конструктор ставил «общее») разложить по людям — один раз
    if (!s.ownFix181) {
        s.ownFix181 = true;
        saveSettings();
        runOwnerFix().then(moved => {
            if (!moved.length) return;
            render();
            setTimeout(() => toast('success', esc(`Разобрала владельцев образов: ${ownerFixText(moved)}`), '👗 Образы', { timeOut: 9000 }), 300);
        }).catch(e => console.warn('[Гардероб] владельцы', e));
    }
    const owners = lookOwners();
    if (!ui.lkWho || (ui.lkWho !== '*' && !owners.includes(ui.lkWho))) {
        // по умолчанию: кто выбран на «На них», иначе — у кого больше всего образов, иначе первый из сцены
        const me = ctx().name1;
        const count = (n) => s.sets.filter(x => x.owner === n && inEra(x)).length;
        const most = [...owners].sort((a, b) => count(b) - count(a))[0];
        ui.lkWho = (ui.who && owners.includes(ui.who) ? ui.who : '') || (most && count(most) ? most : '') || owners.find(n => n !== me) || owners[0] || '*';
    }
    const all = looksShown();
    const shared = looksShared();
    // только что добавленные (ИИ ещё разбирает или не разобрал) — наверху, а не в «Без раздела» в самом низу
    const fresh = all.filter(x => x.pending || x.err);
    const settled = all.filter(x => !x.pending && !x.err);
    const cats = lookCats(settled);
    const nNew = looksIn(all, 'new').length;
    const nNone = looksIn(settled, 'none').length;
    if (ui.lkCat === 'new' && !nNew) ui.lkCat = 'all';
    if (ui.lkCat === 'none' && !nNone) ui.lkCat = 'all';
    if (!['all', 'new', 'none'].includes(ui.lkCat) && !cats.some(c => catKey(c) === catKey(ui.lkCat))) ui.lkCat = 'all';
    const whoName = ui.lkWho === '*' ? 'Все персонажи' : ui.lkWho;
    // 1.8.7: какая эпоха и чей облик сейчас, сколько образов спрятано в других эпохах — видно, что шкаф по эпохам работает
    const eraLine = (() => {
        if (!eraOn()) return '';
        if (eraPending()) return '<div class="wd-lk-era"><i class="fa-solid fa-spinner fa-spin"></i> эпоха чата ещё определяется…</div>';
        const cx = cxNow();
        if (!cx?.era) return '';
        const who = ui.lkWho && ui.lkWho !== '*' ? ui.lkWho : '';
        const lbl = who ? sliceLabel(who) : '';
        const other = ui.allEras ? 0 : s.sets.filter(x => !x.pending && (!who || x.owner === who) && !inEra(x)).length;
        const era = String(cx.era.label || cx.era.id || '');
        return `<div class="wd-lk-era">🕰 ${esc(cut(era, 40))}${lbl ? ` · ${esc(cut(lbl, 44))}` : ''}${other ? ` · <button class="wd-link" data-act="all-eras">ещё ${other} — в других эпохах</button>` : ''}</div>`;
    })();
    const chip = (k, label, n) => `<button class="wd-chip ${ui.lkCat === k ? 'on' : ''}" data-act="look-cat" data-cat="${esc(k)}">${label}${n ? `<small>${n}</small>` : ''}</button>`;
    const head = `<div class="wd-lk-head">
        <div class="wd-lk-top">
            <button class="wd-lk-round" data-act="look-back" title="Назад в гардероб"><i class="fa-solid fa-arrow-left"></i></button>
            <div class="wd-lk-title">Коллекция образов</div>
            <button class="wd-lk-round" data-act="close" title="Закрыть"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wd-lk-row1">
            <div class="wd-lk-whos">
                <button class="wd-lk-who all ${ui.lkWho === '*' ? 'on' : ''}" data-act="look-who" data-name="*" title="Все персонажи"><span>✦</span></button>
                ${owners.map(n => `<button class="wd-lk-who ${ui.lkWho === n ? 'on' : ''}" data-act="look-who" data-name="${esc(n)}" title="${esc(n)}">${avatar(n)}</button>`).join('')}
            </div>
            <button class="wd-lk-add" data-act="look-add"><i class="fa-solid fa-plus"></i> Образ</button>
        </div>
        <div class="wd-lk-sub">
            <span><b>${esc(cut(whoName, 28))}</b> · ${all.length} ${plural(all.length, 'образ', 'образа', 'образов')}${shared.length ? ` · общих ${shared.length}` : ''}</span>
            <button class="wd-lk-style" data-act="look-style" title="Стиль картинок"><i class="fa-solid fa-palette"></i> ${esc(styleShort(s))}</button>
        </div>
        ${eraLine}
        <div class="wd-chips wd-lk-cats">
            ${chip('all', 'Все', '')}
            ${nNew ? chip('new', '✦ Новинки', nNew) : ''}
            ${cats.map(c => chip(c, `${catIcon(c)} ${esc(c)}`, looksIn(all, c).length)).join('')}
            ${nNone ? chip('none', 'Без раздела', nNone) : ''}
            ${eraOn() ? `<button class="wd-chip ${ui.allEras ? 'on' : ''}" data-act="all-eras">🕰 Все эпохи</button>` : ''}
        </div>
    </div>`;

    const sharedSec = shared.length && ui.lkCat === 'all'
        ? `<div class="wd-lk-sec shared"><span>✦ Общие</span><small>${shared.length}</small><button class="wd-link" data-act="look-ownfix">разобрать по владельцам</button></div>
           <div class="wd-lk-shared-hint">Без владельца — видны у всех. Тап по «общий» на карточке — отдать персонажу.</div>${lookGrid(shared)}`
        : '';

    if (!all.length) {
        return `${head}<div class="wd-lk-empty">
            <div class="wd-empty-ico">🎽</div>
            <b>${ui.lkWho === '*' ? 'Образов пока нет' : `У ${esc(shortName(ui.lkWho))} пока нет образов${offDefault() && !ui.allEras ? ' этой эпохи' : ''}`}</b>
            <p>Загрузи фото образа или вставь готовый промт — ИИ сам считает его, разложит на вещи и положит их в шкаф.</p>
            <button class="wd-btn primary" data-act="look-add"><i class="fa-solid fa-plus"></i> Новый образ</button>
            <div class="wd-actions-row">
                <button class="wd-btn" data-act="set-new"><i class="fa-solid fa-box-archive"></i> Собрать из шкафа</button>
                ${ui.lkWho !== '*' && charState(ui.lkWho)?.worn?.length ? '<button class="wd-btn" data-act="look-from-worn"><i class="fa-solid fa-person-dress"></i> Что надето сейчас</button>' : ''}
            </div>
        </div>${sharedSec}`;
    }

    const prof = s.watcherProfile || s.visionProfile;
    const sortBtn = nNone && prof && ['all', 'none'].includes(ui.lkCat)
        ? `<button class="wd-lk-sort" data-act="look-autocat"><i class="fa-solid fa-wand-magic-sparkles"></i> Разложить ${nNone} ${plural(nNone, 'образ', 'образа', 'образов')} без раздела по разделам (ИИ)</button>` : '';
    let body = '';
    if (ui.lkCat === 'all') {
        const groups = [...cats.map(c => [c, looksIn(settled, c)]), ['none', looksIn(settled, 'none')]].filter(([, l]) => l.length);
        body = (fresh.length ? `<div class="wd-lk-sec fresh"><span>✦ Только что добавлено</span><small>${fresh.length}</small></div>${lookGrid(fresh)}` : '')
            + groups.map(([c, l]) => `<div class="wd-lk-sec" data-act="look-cat" data-cat="${esc(c)}"><span>${c === 'none' ? 'Без раздела' : `${catIcon(c)} ${esc(c)}`}</span><small>${l.length}</small></div>${lookGrid(l)}`).join('');
    } else {
        const list = ui.lkCat === 'none' ? looksIn(settled, 'none') : looksIn(all, ui.lkCat);
        const label = ui.lkCat === 'new' ? 'Новинки' : ui.lkCat === 'none' ? 'Без раздела' : ui.lkCat;
        body = list.length ? lookGrid(list)
            : `<div class="wd-lk-empty small"><div class="wd-empty-ico">${catIcon(ui.lkCat)}</div>В разделе «${esc(label)}»${ui.lkWho !== '*' ? ` у ${esc(shortName(ui.lkWho))}` : ''} пока пусто.
                <button class="wd-btn primary" data-act="look-add"><i class="fa-solid fa-plus"></i> Добавить образ</button></div>`;
    }
    return `${head}${sortBtn}${body}${sharedSec}<div class="wd-lk-tip">Свайп по картинке — прежние версии. 👕 — что в образе, промт и правка.</div>`;
}

/** Точечно обновить карточки образов (картинка дорисовалась, разбор закончился), не трогая прокрутку и модалку. */
function paintLooks() {
    if (!ui.open || ui.tab !== 'looks') return;
    const s = settings();
    document.querySelectorAll('#wd-panel .wd-body .wd-lk-card[data-id]').forEach(card => {
        const set = s.sets.find(x => x.id === card.dataset.id);
        if (!set) { card.remove(); return; }
        const html = lookCard(set);
        const key = html.match(/data-key="([^"]*)"/)?.[1];
        if (key !== card.dataset.key) card.outerHTML = html;
    });
}

/** Блок версий картинки под большой картинкой в модалке: ‹ 2 / 3 › и «убрать эту». */
function galHtml(obj) {
    const g = galleryOf(obj);
    if (!obj?.img && !g.length) return `<div class="wd-gal" data-gal-for="${esc(obj?.id || '')}"></div>`;
    const i = Math.max(0, g.indexOf(obj.img));
    return `<div class="wd-gal" data-gal-for="${esc(obj.id)}">
        ${g.length > 1 ? `<button class="wd-gal-btn" data-act="img-step" data-id="${esc(obj.id)}" data-dir="-1" title="Предыдущая"><i class="fa-solid fa-chevron-left"></i></button>
        <span class="wd-gal-n">версия ${i + 1} из ${g.length}</span>
        <button class="wd-gal-btn" data-act="img-step" data-id="${esc(obj.id)}" data-dir="1" title="Следующая"><i class="fa-solid fa-chevron-right"></i></button>` : '<span class="wd-gal-n">одна версия</span>'}
        <button class="wd-link" data-act="img-drop" data-id="${esc(obj.id)}">убрать эту</button>
    </div>`;
}

function bigImgHtml(obj, fallback = '🎨') {
    return `<div class="wd-big tall${drawing.has(obj.id) ? ' wd-drawing' : ''}" data-draw-id="${esc(obj.id)}">${obj.img ? `<img src="${esc(obj.img)}" alt="">` : `<span>${fallback}</span>`}</div>${galHtml(obj)}`;
}

/** Обновить блок версий в открытой модалке. */
function paintGallery() {
    document.querySelectorAll('#wd-panel .wd-modal [data-gal-for]').forEach(el => {
        const obj = imgOwner(el.dataset.galFor);
        if (obj) el.outerHTML = galHtml(obj);
    });
}

/** Листнуть картинку вещи/образа (свайп по карточке или ‹ › в модалке). */
function stepImage(id, dir) {
    const obj = imgOwner(id);
    if (!obj || galleryOf(obj).length < 2) return;
    stepImg(obj, dir);
    if (closetItem(id)) syncItemImg(obj);
    saveSettings();
    document.querySelectorAll(`#wd-panel .wd-modal [data-draw-id="${CSS.escape(id)}"] img`).forEach(img => { img.src = obj.img; });
    paintGallery();
    if (ui.tab === 'looks') paintLooks(); else if (closetItem(id)) render();
}

function catSelect(value, attr, { auto = false } = {}) {
    const cats = settings().cats;
    const known = !value || cats.some(c => catKey(c) === catKey(value));
    return `<select ${attr}>
        ${auto ? `<option value="" ${!value ? 'selected' : ''}>✦ Авто (ИИ)</option>` : `<option value="" ${!value ? 'selected' : ''}>без раздела</option>`}
        ${cats.map(c => `<option value="${esc(c)}" ${value && catKey(c) === catKey(value) ? 'selected' : ''}>${catIcon(c)} ${esc(c)}</option>`).join('')}
        ${known ? '' : `<option value="${esc(value)}" selected>${esc(value)}</option>`}
        <option value="__new">＋ свой раздел…</option>
    </select>`;
}

/** Значение раздела из формы: выбранный или вписанный свой (тогда он добавляется в список разделов). */
function readCat(box, attr) {
    const sel = box.querySelector(`[${attr}]`);
    let v = sel?.value || '';
    if (v === '__new') {
        v = String(box.querySelector('[data-input="catnew"]')?.value || '').trim().slice(0, 40);
        if (v) {
            const s = settings();
            if (!s.cats.some(c => catKey(c) === catKey(v))) { s.cats = catList([...s.cats, v]); saveSettings(); }
        }
    }
    return v;
}

/** Чей новый образ по умолчанию: открытый персонаж, выбранный на «На них», у кого больше всего образов — не «общий». */
function defaultOwner() {
    if (ui.lkWho && ui.lkWho !== '*') return ui.lkWho;
    if (ui.who) return ui.who;
    const s = settings();
    const count = (n) => s.sets.filter(x => x.owner === n).length;
    const owners = lookOwners();
    const most = [...owners].sort((a, b) => count(b) - count(a))[0];
    if (most && count(most)) return most;
    const me = ctx().name1;
    return castNames().find(n => n !== me) || me || '';
}

/** «＋ Образ»: фото образа и/или готовый промт → ИИ разберёт за кадром. */
function lookAddModal({ owner, cat } = {}) {
    const s = settings();
    const who = owner || defaultOwner();
    const c = cat ?? (['all', 'new', 'none'].includes(ui.lkCat) ? '' : ui.lkCat);
    const prof = s.visionProfile || s.watcherProfile;
    ui.draft = { kind: 'look', dataUrl: '', img: '', uploading: false };
    openModal('Новый образ', `
        ${prof ? '' : '<div class="wd-hint" data-act="tab" data-tab="cfg"><i class="fa-solid fa-circle-info"></i> Выбери в ⚙ профиль для фото — эта модель считывает образы и раскладывает их на вещи.</div>'}
        <label class="wd-lk-drop">
            <input type="file" accept="image/*" data-input="lkfile" hidden>
            <div class="wd-lk-drop-prev"></div>
            <span class="wd-lk-drop-t"><i class="fa-solid fa-camera"></i> Фото образа</span>
            <small>ИИ считает с него промт и разложит на вещи</small>
        </label>
        <div class="wd-or"><span>или / и</span></div>
        <div class="wd-field"><label>Готовый промт образа</label>
            <textarea rows="4" data-input="lktext" placeholder="вставь промт — например, скопированный из коллекции нарядов"></textarea></div>
        <div class="wd-grid2">
            <div class="wd-field"><label>Чей</label>${ownerSelect(who, 'data-input="lkowner"')}</div>
            <div class="wd-field"><label>Раздел</label>${catSelect(c, 'data-input="lkcat"', { auto: true })}</div>
        </div>
        <div class="wd-field"><label>Название <small>(пусто — придумает ИИ)</small></label><input type="text" data-input="lkname" placeholder="например: Кремовый блейзер и шёлк"></div>
        <label class="wd-switch"><input type="checkbox" data-input="lkcover" ${s.lkDrawCover && canDraw() ? 'checked' : ''}><span></span>Нарисовать образ на персонаже — стиль «${esc(styleShort(s))}», лицо из рефов</label>
        <label class="wd-switch"><input type="checkbox" data-input="lkitems" ${s.lkDrawItems && canDraw() ? 'checked' : ''}><span></span>Нарисовать новые вещи для шкафа — стиль «${esc(styleShort(itemView(s)))}»</label>
        <label class="wd-switch"><input type="checkbox" data-input="lkhair" ${s.lkHair ? 'checked' : ''}><span></span>Взять и причёску с макияжем (обычно не надо — у персонажа свои)</label>
        <button class="wd-btn primary full" data-act="look-import"><i class="fa-solid fa-wand-magic-sparkles"></i> Добавить — ИИ разберёт сам</button>
        <div class="wd-or"><span>или собрать самой</span></div>
        <div class="wd-actions-row">
            <button class="wd-btn" data-act="set-new"><i class="fa-solid fa-box-archive"></i> Из шкафа</button>
            <button class="wd-btn" data-act="look-from-worn"><i class="fa-solid fa-person-dress"></i> Что надето сейчас</button>
        </div>`);
}

/** Карточка образа: картинка с версиями, надеть, перерисовать, промт, вещи внутри, правка. */
function lookModal(id) {
    const set = settings().sets.find(x => x.id === id);
    if (!set) return;
    const its = (set.itemIds || []).map(closetItem).filter(Boolean);
    const who = lookTarget(set);
    const on = !!who && lookWornBy(set, who);
    const busy = !!set.pending && importing.has(set.id);
    const err = set.err || (set.pending && !busy ? 'разбор прервался' : '');
    openModal(esc(set.name), `
        ${bigImgHtml(set, set.cat ? catIcon(set.cat) : '🎽')}
        ${busy ? '<div class="wd-hint-soft"><i class="fa-solid fa-spinner fa-spin"></i> ИИ ещё разбирает образ на вещи…</div>' : ''}
        ${err && !busy ? `<div class="wd-hint wd-hint-err" data-act="look-retry" data-id="${esc(set.id)}"><i class="fa-solid fa-rotate-right"></i> Не разобралось: ${esc(err)}. Нажми — разберу снова.</div>` : ''}
        ${its.length ? `<div class="wd-actions-row">
            <button class="wd-btn primary" data-act="look-wear" data-id="${esc(set.id)}"><i class="fa-solid fa-shirt"></i> ${on ? 'Надето ✓' : who ? `Надеть на ${esc(shortName(who))}` : 'Надеть на…'}</button>
            <button class="wd-btn" data-act="look-wear-all" data-id="${esc(set.id)}" title="Снять всю остальную одежду (📌, причёска и макияж останутся)"><i class="fa-solid fa-repeat"></i> Переодеть полностью</button>
        </div>` : ''}
        <div class="wd-actions-row">
            <button class="wd-btn" data-act="set-draw" data-id="${esc(set.id)}"><i class="fa-solid fa-palette"></i> ${set.img ? 'Перерисовать' : 'Нарисовать'} · ${esc(styleShort(settings()))}</button>
            <label class="wd-btn"><i class="fa-solid fa-camera"></i> Своё фото<input type="file" accept="image/*" data-input="lookfile" data-id="${esc(set.id)}" hidden></label>
            <button class="wd-btn" data-act="look-copy" data-id="${esc(set.id)}"><i class="fa-solid fa-copy"></i> Промт</button>
        </div>
        <div class="wd-sec">В образе · ${its.length} ${plural(its.length, 'вещь', 'вещи', 'вещей')} <button class="wd-link" data-act="set-edit" data-id="${esc(set.id)}">изменить состав</button></div>
        ${its.length ? `<div class="wd-grid small">${its.map(it => itemCard(it)).join('')}</div>` : `<div class="wd-empty small">${busy ? 'Скоро появятся.' : 'Вещей нет — добавь из шкафа («изменить состав»).'}</div>`}
        <div class="wd-sec">Об образе</div>
        <div class="wd-field"><label>Название</label><input type="text" data-f="name" value="${esc(set.name)}"></div>
        <div class="wd-grid2">
            <div class="wd-field"><label>Чей</label>${ownerSelect(set.owner)}</div>
            <div class="wd-field"><label>Раздел</label>${catSelect(set.cat || '', 'data-f="cat"')}</div>
        </div>
        ${set.owner && eraOn() ? sliceSelect(set) : ''}
        <div class="wd-field"><label>Промт образа <small>(по-английски: по нему рисуется, его копирует ⧉)</small></label>
            <textarea rows="4" data-f="prompt" placeholder="пусто — рисую по списку вещей">${esc(set.prompt || '')}</textarea></div>
        ${set.src?.text ? `<details class="wd-src"><summary>Исходный промт, который ты вставила</summary><pre class="wd-pre">${esc(set.src.text)}</pre></details>` : ''}
        <div class="wd-actions-row">
            <button class="wd-btn primary" data-act="look-save" data-id="${esc(set.id)}"><i class="fa-solid fa-check"></i> Сохранить</button>
            <button class="wd-btn danger" data-act="set-del" data-id="${esc(set.id)}"><i class="fa-solid fa-trash"></i> Удалить образ</button>
        </div>`, (box) => { box.dataset.look = set.id; });
}

/** Стиль картинок — быстро с страницы образов (и вернуть «как было»). */
function styleModal() {
    const s = settings();
    const opts = [...Object.entries(STYLES).map(([k, v]) => [k, v.t, v.d || '']), ['custom', 'Свой промт стиля', 'пишется в ⚙ → Картинки вещей']];
    const shown = looksIn(looksShown(), ui.lkCat).filter(x => !x.pending && ((x.itemIds || []).length || x.prompt));
    const row = (cur, which) => `<div class="wd-menu">${opts.map(([k, t, d]) => `<button class="wd-menu-item wd-style-opt ${k === cur ? 'on' : ''}" data-act="style-pick" data-for="${which}" data-v="${esc(k)}">
            ${k === cur ? '<i class="fa-solid fa-circle-check"></i>' : '<span class="wd-radio"></span>'}
            <span class="wd-style-txt"><b>${esc(t)}</b>${d ? `<small>${esc(d)}</small>` : ''}</span></button>`).join('')}</div>`;
    openModal('Стиль картинок', `
        <div class="wd-sec">Образы</div>
        ${row(s.imgStyle, 'looks')}
        <div class="wd-sec">Вещи в шкафу</div>
        ${row(s.itemStyle, 'items')}
        <div class="wd-hint-soft">Старые картинки не пропадают: новая встаёт сверху, прежние листаются свайпом по карточке.</div>
        ${shown.length ? `<button class="wd-btn full" data-act="draw-looks-shown"><i class="fa-solid fa-rotate"></i> Перерисовать показанные образы в этом стиле (${shown.length})</button>` : ''}`);
}

/** Сохранить надетое как образ (вещи — в шкаф, если их там нет). */
function saveWornAsSet(who) {
    const s = settings();
    const st = charState(who);
    const toSave = (st?.worn || []).filter(e => !e.pinned);
    if (!toSave.length) { toast('info', 'На нём ничего нет (кроме закреплённого)', '👗 Гардероб'); return null; }
    const ids = toSave.map(e => {
        if (e.itemId && closetItem(e.itemId)) return e.itemId;
        const it = addToCloset({ name: e.name, slot: e.slot, desc: e.desc, img: e.img, owner: who });
        e.itemId = it.id;
        return it.id;
    });
    const set = { id: uid(), name: `${shortName(who)} — образ ${s.sets.length + 1}`, owner: who, itemIds: ids, at: Date.now() };
    retag(set, who);
    s.sets.unshift(set);
    saveSettings();
    return set;
}

/** Скопировать текст (в модалке <dialog> всё снаружи «инертно», поэтому запасной textarea — внутри плашки). */
function copyText(text) {
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px';
        (document.getElementById('wd-panel') || document.body).append(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        return ok;
    };
    const manual = () => openModal('Промт образа', `<div class="wd-hint-soft">Не дали скопировать автоматически — выдели и скопируй:</div><textarea rows="8" readonly>${esc(text)}</textarea>`);
    const done = () => toast('success', 'Промт скопирован', '👗 Гардероб', { timeOut: 1600 });
    try {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done, () => (fallback() ? done() : manual()));
            return;
        }
    } catch { /* старый способ */ }
    if (fallback()) done(); else manual();
}

function renderCfg() {
    const s = settings();
    const preview = updateInjection();
    return `<div class="wd-form">
        <label class="wd-switch"><input type="checkbox" data-set="enabled" ${s.enabled ? 'checked' : ''}><span></span>Гардероб включён (отдаёт одежду модели)</label>
        <label class="wd-switch"><input type="checkbox" data-set="watcherOn" ${s.watcherOn ? 'checked' : ''}><span></span>Костюмер сам следит, кто что снял и надел</label>
        <div class="wd-field"><label>Профиль костюмера <small>(дешёвая быстрая модель, Gemini Flash и т.п.)</small></label>
            <select data-set="watcherProfile">${profileOptions(s.watcherProfile)}</select></div>
        <div class="wd-field"><label>Профиль для фото <small>(должен видеть картинки; пусто — тот же)</small></label>
            <select data-set="visionProfile">${profileOptions(s.visionProfile, '— тот же, что у костюмера —')}</select></div>
        <label class="wd-switch"><input type="checkbox" data-set="keywordsOnly" ${s.keywordsOnly ? 'checked' : ''}><span></span>Звать костюмера, только если в сообщении есть слова про одежду (экономия)</label>
        <label class="wd-switch"><input type="checkbox" data-set="watchUser" ${s.watchUser ? 'checked' : ''}><span></span>Следить и за моими сообщениями (до ответа бота)</label>
        <label class="wd-switch"><input type="checkbox" data-set="detail" ${s.detail ? 'checked' : ''}><span></span>Отдавать модели описания вещей, а не только названия</label>
        <label class="wd-switch"><input type="checkbox" data-set="showFab" ${s.showFab ? 'checked' : ''}><span></span>Плавающая кнопка 👗 на экране</label>
        <div class="wd-grid2">
            <div class="wd-field"><label>Глубина в промпте</label><input type="number" min="0" max="10" data-set="depth" value="${esc(s.depth)}"></div>
            <div class="wd-field"><label>Reasoning effort</label><select data-set="effort">${['', 'low', 'medium', 'high'].map(v => `<option value="${v}" ${v === s.effort ? 'selected' : ''}>${v || 'из профиля'}</option>`).join('')}</select></div>
        </div>
        <div class="wd-field"><label>Как персонажей зовут в тексте <small>(Имя карточки = прозвища через запятую)</small></label>
            <textarea rows="3" data-set="aliases">${esc(s.aliases)}</textarea></div>
        <div class="wd-field"><label>Разделы образов <small>(по одному в строке; «Офис», «Вечернее» и «Спортивное» видны у каждого всегда)</small></label>
            <textarea rows="4" data-set="cats">${esc(s.cats.join('\n'))}</textarea></div>
        ${imgSettings(s)}
        <div class="wd-actions-row">
            <button class="wd-btn" data-act="check-last"><i class="fa-solid fa-magnifying-glass"></i> Проверить последнее сообщение</button>
        </div>
        <div class="wd-field"><label>Что сейчас видит модель</label><pre class="wd-pre">${esc(preview || '— пусто: ни на ком ничего не записано —')}</pre></div>
        <div class="wd-foot">Гардероб ${VERSION} · <code>/wardrobe</code> открывает эту плашку</div>
    </div>`;
}

function imgSettings(s) {
    const silly = ctx().extensionSettings?.inline_image_gen;
    const slay = ctx().extensionSettings?.slay_image_gen;
    const opts = [['auto', 'авто (SLAY, если он настроен)']];
    if (slay?.apiKey) opts.push(['slay', `SLAY Images (${slay.apiType || '—'}${slay.apiType === 'naistera' ? `: ${slay.naisteraModel || 'grok'}` : slay.apiType === 'atlas' ? `: ${slay.atlasModel || 'kontext'}` : slay.model ? `: ${slay.model}` : ''})`]);
    if (silly) {
        opts.push(['silly', `sillyimages (${silly.apiType || '—'}${silly.model ? `: ${silly.model}` : ''})`]);
        for (const p of silly.connectionProfiles || []) opts.push([p.id, `sillyimages — ${p.name} (${p.apiType})`]);
    }
    opts.push(['own', 'свой ключ / токен']);
    const src = opts.some(o => o[0] === s.imgSource) ? s.imgSource : opts[0][0];
    if (src !== s.imgSource) { s.imgSource = src; saveSettings(); }
    const conn = imgConnection();
    const own = src === 'own' ? `
        <div class="wd-grid2">
            <div class="wd-field"><label>Провайдер</label><select data-set="imgProvider">${[['atlas', 'Atlas Cloud'], ['naistera', 'Naistera (токен из бота)'], ['openrouter', 'OpenRouter'], ['gemini', 'Gemini (Google)'], ['xai', 'xAI (Grok)'], ['openai', 'OpenAI']].map(([v, t]) => `<option value="${v}" ${v === s.imgProvider ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            ${['naistera', 'atlas'].includes(s.imgProvider) ? '<div></div>' : `<div class="wd-field"><label>Модель</label><input type="text" data-set="imgModel" value="${esc(s.imgModel)}" placeholder="${esc(DEFAULT_MODELS[s.imgProvider] || '')}"></div>`}
        </div>
        <div class="wd-field"><label>${s.imgProvider === 'naistera' ? 'Токен Naistera' : 'API-ключ'}</label><input type="password" data-set="imgKey" value="${esc(s.imgKey)}" autocomplete="off"></div>` : '';
    return `<div class="wd-sec">🎨 Картинки вещей</div>
        <div class="wd-field"><label>Чем рисовать</label><select data-set="imgSource">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === src ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        ${own}
        ${conn.apiType === 'atlas' ? `<div class="wd-field"><label>Модель Atlas для вещей и образов <small>(все рисовалки SLAY; лицо по рефу держат только модели с рефами)</small></label><select data-set="imgAtlasModel"><option value="">${esc(slay?.apiType === 'atlas' && atlasTakesRefs(slay.atlasModel) ? `как в SLAY (${ATLAS_EDIT[slay.atlasModel].t})` : `по умолчанию (${ATLAS_EDIT[DEFAULT_MODELS.atlas].t})`)}</option>${[['С рефами — держат лицо', true], ['Только по тексту — лицо не держат', false]].map(([g, refs]) => `<optgroup label="${g}">${Object.entries(ATLAS_EDIT).filter(([m]) => atlasTakesRefs(m) === refs).map(([m, v]) => `<option value="${esc(m)}" ${m === s.imgAtlasModel ? 'selected' : ''}>${esc(v.t)}</option>`).join('')}</optgroup>`).join('')}</select></div>` : ''}
        ${conn.apiType === 'naistera' ? `<div class="wd-field"><label>Модель Naistera для вещей</label><select data-set="imgNaisteraModel"><option value="">как в профиле (NovelAI → Nano Banana)</option>${NAISTERA_MODELS.map(m => `<option value="${m}" ${m === s.imgNaisteraModel ? 'selected' : ''}>${m}</option>`).join('')}</select></div>` : ''}
        <div class="wd-field"><label>Стиль образов</label><select data-set="imgStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${k === s.imgStyle ? 'selected' : ''}>${esc(v.t)}</option>`).join('')}<option value="custom" ${s.imgStyle === 'custom' ? 'selected' : ''}>Свой промпт стиля</option></select></div>
        <div class="wd-field"><label>Стиль вещей в шкафу</label><select data-set="itemStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${k === s.itemStyle ? 'selected' : ''}>${esc(v.t)}</option>`).join('')}<option value="custom" ${s.itemStyle === 'custom' ? 'selected' : ''}>Свой промпт стиля</option></select></div>
        <div class="wd-field"><label>На ком рисовать <small>(лукбук, причёски, макияж)</small></label><select data-set="imgOnPerson">
            <option value="owner" ${s.imgOnPerson !== 'model' ? 'selected' : ''}>на владельце вещи — его лицо из рефов sillyimages/SLAY или аватарки</option>
            <option value="model" ${s.imgOnPerson === 'model' ? 'selected' : ''}>на нейтральной модели</option></select></div>
        ${s.imgStyle === 'custom' || s.itemStyle === 'custom' ? `<div class="wd-field"><label>Промпт стиля (по-английски лучше)</label><textarea rows="3" data-set="imgStyleCustom">${esc(s.imgStyleCustom)}</textarea></div>` : ''}
        <label class="wd-switch"><input type="checkbox" data-set="autoDraw" ${s.autoDraw ? 'checked' : ''}><span></span>Сразу рисовать новые вещи</label>
        <div class="wd-hint-soft">${conn.error ? `⚠️ ${esc(conn.error)}` : `Рисую через ${esc(conn.apiType)} · ${esc(conn.model)}`}</div>
        <div class="wd-sec">Прочее</div>`;
}

function render() {
    const panel = document.getElementById('wd-panel');
    if (!panel || !ui.open) return;
    if (ui.tab === 'sets') ui.tab = 'looks';
    panel.querySelectorAll('.wd-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
    // образы — отдельная страница на весь экран
    panel.classList.toggle('wd-full', ui.tab === 'looks');
    const body = panel.querySelector('.wd-body');
    const scroll = ui.shownTab === ui.tab ? body.scrollTop : 0;
    ui.shownTab = ui.tab;
    try {
        body.innerHTML = ui.tab === 'closet' ? renderCloset()
            : ui.tab === 'looks' ? renderLooks()
                : ui.tab === 'cfg' ? renderCfg()
                    : renderWorn();
    } catch (e) {
        console.error('[Гардероб] render', e);
        body.innerHTML = `<div class="wd-empty"><div class="wd-empty-ico">🧯</div><b>Ошибка гардероба</b><pre class="wd-pre" style="text-align:left">${esc(String(e?.stack || e).slice(0, 900))}</pre>Сделай скрин и кинь Claude.</div>`;
    }
    body.scrollTop = scroll;
    if (eraPending()) pendingRerender();
}

// ядро ещё не пересобрало снимок этого чата: перерисовать, как пересоберёт (и без события — проверкой раз в 0,7 с, до 18 с)
let pendT = null, pendN = 0;
function pendingRerender() {
    if (pendT) return;
    pendT = setTimeout(() => {
        pendT = null;
        dropEraMemo();
        if (!ui.open) { pendN = 0; return; }
        if (eraPending()) { if (++pendN > 25) return; } else pendN = 0;
        render();
    }, 700);
}

// ───── модалки внутри плашки ─────

function openModal(title, html, onMount) {
    const host = document.querySelector('#wd-panel .wd-modal-host');
    if (!host) return null;
    host.innerHTML = `<div class="wd-modal-back" data-act="modal-close"></div>
        <div class="wd-modal" role="dialog">
            <div class="wd-modal-head"><div class="wd-modal-title">${title}</div><button class="wd-x" data-act="modal-close"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="wd-modal-body">${html}</div>
        </div>`;
    host.classList.add('on');
    const box = host.querySelector('.wd-modal');
    onMount?.(box);
    return box;
}

function closeModal() {
    const host = document.querySelector('#wd-panel .wd-modal-host');
    if (host) { host.classList.remove('on'); host.innerHTML = ''; }
    ui.draft = null;
    ui.sb = null;
}

function menuList(items) {
    return `<div class="wd-menu">${items.filter(Boolean).map(([act, icon, label, extra = '', danger = false]) =>
        `<button class="wd-menu-item ${danger ? 'danger' : ''}" data-act="${act}" ${extra}><i class="fa-solid ${icon}"></i>${label}</button>`).join('')}</div>`;
}

function personPicker(act, extra = '') {
    return `<div class="wd-people wrap">${castNames().map(n => `
        <button class="wd-person" data-act="${act}" data-name="${esc(n)}" ${extra}>${avatar(n)}<span>${esc(shortName(n))}</span></button>`).join('')}</div>`;
}

function entryMenu(entryUid) {
    const f = findEntry(ui.who, entryUid);
    if (!f) return;
    const e = f.e;
    openModal(esc(e.name), `
        <div class="wd-field"><label>Пометка (расстёгнута, мокрая, задрана…)</label>
            <div class="wd-inline"><input type="text" data-input="state" value="${esc(e.state)}" placeholder="как обычно"><button class="wd-btn primary" data-act="entry-state" data-uid="${esc(e.uid)}">OK</button></div></div>
        <div class="wd-field"><label>Название</label>
            <div class="wd-inline"><input type="text" data-input="ename" value="${esc(e.name)}"><button class="wd-btn" data-act="entry-rename" data-uid="${esc(e.uid)}">OK</button></div></div>
        ${menuList([
            f.list === 'worn' ? ['takeoff', 'fa-arrow-down', 'Снять (оставить рядом)', `data-uid="${esc(e.uid)}"`] : ['puton', 'fa-arrow-up', 'Надеть обратно', `data-uid="${esc(e.uid)}"`],
            ['entry-pin', 'fa-thumbtack', e.pinned ? 'Открепить' : 'Закрепить 📌 (не снимать при смене комплекта и «Раздеть»)', `data-uid="${esc(e.uid)}"`],
            ['entry-give', 'fa-hand-holding', 'Отдать другому персонажу', `data-uid="${esc(e.uid)}"`],
            e.itemId ? null : ['entry-save', 'fa-box-archive', 'Сохранить в шкаф', `data-uid="${esc(e.uid)}"`],
            ['entry-del', 'fa-trash', 'Убрать совсем', `data-uid="${esc(e.uid)}"`, true],
        ])}`);
}

function itemMenu(id) {
    const it = closetItem(id);
    if (!it) return;
    const looks = settings().sets.filter(x => (x.itemIds || []).includes(it.id));
    openModal(esc(it.name), `
        ${bigImgHtml(it, slotOf(it.slot).i)}
        <div class="wd-actions-row">
            <button class="wd-btn primary" data-act="item-draw" data-id="${esc(it.id)}"><i class="fa-solid fa-palette"></i> ${it.img ? 'Перерисовать' : 'Нарисовать'} · ${esc(styleShort(itemView(settings())))}</button>
            <label class="wd-btn"><i class="fa-solid fa-camera"></i> Своё фото<input type="file" accept="image/*" data-input="itemfile" data-id="${esc(it.id)}" hidden></label>
        </div>
        ${looks.length ? `<div class="wd-sec">В образах</div><div class="wd-chips">${looks.map(x => `<button class="wd-chip" data-act="look-open" data-id="${esc(x.id)}">${x.cat ? catIcon(x.cat) : '🎽'} ${esc(cut(x.name, 30))}</button>`).join('')}</div>` : ''}
        <div class="wd-sec">Надеть на</div>
        ${personPicker('item-wear', `data-id="${esc(it.id)}"`)}
        <div class="wd-sec">Изменить</div>
        ${itemForm(it)}
        <div class="wd-actions-row">
            <button class="wd-btn primary" data-act="item-save" data-id="${esc(it.id)}"><i class="fa-solid fa-check"></i> Сохранить</button>
            <button class="wd-btn danger" data-act="item-del" data-id="${esc(it.id)}"><i class="fa-solid fa-trash"></i> Удалить</button>
        </div>`);
}

function slotSelect(value, attr = 'data-f="slot"') {
    return `<select ${attr}>${SLOTS.map(sl => `<option value="${sl.k}" ${sl.k === value ? 'selected' : ''}>${sl.i} ${esc(sl.t)}</option>`).join('')}</select>`;
}

// ── эпоха у образа руками (1.8.7): облики личности владельца из Реестра ядра ──
let regIds = null;   // [{ id, names: [норм.], slices: [{ id, label, from, to }] }]
let regBusy = null;
function regLoad() {
    if (regIds || regBusy) return regBusy;
    const api = globalThis.SacredTimeline;
    if (typeof api?.registry !== 'function') return null;
    regBusy = Promise.resolve(api.registry()).then((reg) => {
        const out = [];
        for (const e of Object.values(reg?.entries || {})) {
            const g = e?.gc;
            if (g?.type !== 'identity' || !g.id || !(g.slices || []).length) continue;
            out.push({ id: g.id, names: [g.name, ...(g.aliases || [])].filter(Boolean).map(norm),
                slices: g.slices.filter(x => x?.id).map(x => ({ id: x.id, label: x.label || x.id, from: String(x.from || ''), to: String(x.to || '') })) });
        }
        regIds = out;
    }).catch(() => { regIds = []; }).finally(() => { regBusy = null; });
    return regBusy;
}
/** Облики владельца по Реестру ([] — его там нет; null — Реестр ещё не прочитан). «Steve Rogers 1943» — как «Steve Rogers». */
function slicesFor(owner) {
    if (!regIds || !owner) return null;
    const id = sliceHere(owner)?.identity;
    const a = norm(owner), b = norm(String(owner).replace(/\s+(19|20)\d{2}$/, ''));
    return regIds.find(x => (id && x.id === id) || x.names.includes(a) || x.names.includes(b))?.slices || [];
}
function sliceSelect(set) {
    const list = slicesFor(set?.owner);
    if (!list?.length) return '';
    const y = (d) => String(d || '').slice(0, 4);
    const opts = [...list].sort((p, q) => p.from.localeCompare(q.from))
        .map(sl => `<option value="${esc(sl.id)}" ${sl.id === set.slice ? 'selected' : ''}>${esc(`${y(sl.from) || '…'}–${y(sl.to) || 'сейчас'} · ${cut(sl.label, 46)}`)}</option>`);
    return `<div class="wd-field"><label>Эпоха <small>(облик: в чатах других эпох образ не виден)</small></label><select data-f="slice">
        <option value="" ${!set.slice ? 'selected' : ''}>без эпохи — везде, где есть ${esc(shortName(set.owner))}</option>${opts.join('')}</select></div>`;
}

function ownerSelect(value, attr = 'data-f="owner"') {
    return `<select ${attr}><option value="" ${!value ? 'selected' : ''}>общее</option>${ownersList().map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
}

function itemForm(it) {
    return `<div class="wd-field"><label>Название</label><input type="text" data-f="name" value="${esc(it.name)}"></div>
        <div class="wd-grid2">
            <div class="wd-field"><label>Тип</label>${slotSelect(it.slot)}</div>
            <div class="wd-field"><label>Чьё</label>${ownerSelect(it.owner)}</div>
        </div>
        <div class="wd-field"><label>Описание</label><textarea rows="3" data-f="desc">${esc(it.desc)}</textarea></div>
        <label class="wd-switch"><input type="checkbox" data-f="pinned" ${it.pinned ? 'checked' : ''}><span></span>📌 Закреплённая вещь — кольца, пирсинг, жетоны: не снимается при смене комплекта и при «Раздеть»</label>`;
}

function readForm(box) {
    const v = (f) => box.querySelector(`[data-f="${f}"]`)?.value ?? '';
    return { name: v('name').trim(), slot: v('slot'), owner: v('owner'), desc: v('desc').trim(), pinned: !!box.querySelector('[data-f="pinned"]')?.checked };
}

/** Новая вещь / образ: текст, промпт или фото → ИИ раскладывает на вещи. */
function newItemModal({ wearOn = '' } = {}) {
    ui.draft = { dataUrl: '', img: '', items: [], wearOn };
    openModal('Новая вещь или образ', `
        <div class="wd-hint" data-act="to-look-add"><i class="fa-solid fa-layer-group"></i> Целый образ (фото или готовый промт)? Добавь его в «Образы» — ИИ сам разложит на вещи, положит их в шкаф и соберёт образ.</div>
        <div class="wd-field"><label>Опиши вещь или вставь промпт образа</label>
            <textarea rows="4" data-input="ntext" placeholder="например: oversized grey hoodie, black leggings, white sneakers — или «чёрное шерстяное пальто до колена»"></textarea></div>
        <div class="wd-photo">
            <label class="wd-btn"><i class="fa-solid fa-camera"></i> Фото вещи или образа<input type="file" accept="image/*" data-input="nfile" hidden></label>
            <div class="wd-photo-prev"></div>
        </div>
        <div class="wd-grid2">
            <div class="wd-field"><label>Чьё</label>${ownerSelect(wearOn || '', 'data-input="nowner"')}</div>
            <div class="wd-field"><label>Тип <small>(если без ИИ)</small></label>${slotSelect('top', 'data-input="nslot"')}</div>
        </div>
        <label class="wd-switch"><input type="checkbox" data-input="ndraw" ${settings().autoDraw && canDraw() ? 'checked' : ''}><span></span>Нарисовать картинки новым вещам</label>
        <div class="wd-actions-row">
            <button class="wd-btn primary" data-act="n-analyze"><i class="fa-solid fa-wand-magic-sparkles"></i> Разложить на вещи (ИИ)</button>
            <button class="wd-btn" data-act="n-plain"><i class="fa-solid fa-plus"></i> Одной вещью, без ИИ</button>
        </div>
        <div class="wd-proposed"></div>`);
}

function renderProposed(box) {
    const d = ui.draft;
    const host = box.querySelector('.wd-proposed');
    if (!host || !d) return;
    if (!d.items.length) { host.innerHTML = ''; return; }
    const who = d.wearOn || ui.who;
    host.innerHTML = `<div class="wd-sec">ИИ нашёл ${d.items.length} ${plural(d.items.length, 'вещь', 'вещи', 'вещей')} — поправь, если надо</div>
        ${d.items.map((it, i) => `<div class="wd-prop">
            <label class="wd-check"><input type="checkbox" data-p="on" data-i="${i}" ${it.on !== false ? 'checked' : ''}><span></span></label>
            <div class="wd-prop-main">
                <input type="text" data-p="name" data-i="${i}" value="${esc(it.name)}">
                ${slotSelect(it.slot, `data-p="slot" data-i="${i}"`)}
                <textarea rows="2" data-p="desc" data-i="${i}">${esc(it.desc)}</textarea>
            </div>
        </div>`).join('')}
        <div class="wd-actions-row">
            <button class="wd-btn primary" data-act="n-save" data-wear="1"><i class="fa-solid fa-shirt"></i> В шкаф и надеть на ${esc(shortName(who))}</button>
            <button class="wd-btn" data-act="n-save"><i class="fa-solid fa-box-archive"></i> Только в шкаф</button>
        </div>`;
}

function readProposed(box) {
    const d = ui.draft;
    if (!d) return [];
    box.querySelectorAll('[data-p]').forEach(el => {
        const it = d.items[Number(el.dataset.i)];
        if (!it) return;
        if (el.dataset.p === 'on') it.on = el.checked;
        else it[el.dataset.p] = el.value;
    });
    return d.items.filter(it => it.on !== false && String(it.name || '').trim());
}

function pickClosetModal() {
    const who = ui.who;
    const items = settings().items.filter(x => inEra(x));
    const mine = items.filter(it => !it.owner || it.owner === who);
    const rest = items.filter(it => it.owner && it.owner !== who);
    openModal(`Из шкафа → ${esc(shortName(who))}`, items.length ? `
        <div class="wd-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Поиск" data-input="pickq"></div>
        <div class="wd-grid small" data-pick-grid>${[...mine, ...rest].map(it => itemCard(it, 'pick-wear')).join('')}</div>
        <div class="wd-hint-soft">Тапни вещь — она сразу наденется. Можно тапать несколько.</div>`
        : `<div class="wd-empty"><div class="wd-empty-ico">🧺</div>Шкаф пустой.</div>
           <button class="wd-btn primary full" data-act="new-item"><i class="fa-solid fa-plus"></i> Добавить вещь</button>`);
}

/**
 * Вещи для состава образа. У образа с владельцем — только его вещи (её «для одежды Хеди — только её»; эпохи одного
 * человека — по baseName), у общего — все; уже выбранные — всегда, чтобы их можно было снять.
 */
function sbItems() {
    const { who, chosen } = ui.sb;
    const items = settings().items.filter(x => inEra(x));
    if (!who) return items;
    const b = baseName(who);
    return items.filter(it => chosen.has(it.id) || (it.owner && (it.owner === who || baseName(it.owner) === b)));
}

/** Сетка состава: чипы людей (только у общего образа), чипы разделов, вещи по разделам. */
function sbGrid() {
    const sb = ui.sb;
    let items = sbItems();
    const people = sb.who ? [] : [...new Set(items.map(it => it.owner || ''))].sort((a, b) => (!a) - (!b) || a.localeCompare(b));
    if (!sb.who && sb.person !== 'all') items = items.filter(it => (it.owner || '') === sb.person);
    const slots = SLOTS.filter(sl => items.some(it => normSlot(it.slot) === sl.k));
    if (sb.slot !== 'all' && !slots.some(sl => sl.k === sb.slot)) sb.slot = 'all';
    const card = (it) => `<button class="wd-card ${sb.chosen.has(it.id) ? 'on' : ''}" data-act="set-toggle" data-id="${esc(it.id)}">${thumb(it, 'wd-card-img')}<div class="wd-card-name">${esc(it.name)}</div>${!sb.who && sb.person === 'all' ? `<div class="wd-card-meta">${it.owner ? esc(shortName(it.owner)) : 'общее'}</div>` : sb.who && it.owner && baseName(it.owner) !== baseName(sb.who) ? `<div class="wd-card-meta">${esc(shortName(it.owner))} · уже в образе</div>` : ''}</button>`;
    const pchips = people.length > 1 ? `<div class="wd-chips"><button class="wd-chip ${sb.person === 'all' ? 'on' : ''}" data-act="sb-person" data-owner="all">все</button>${people.map(p => `<button class="wd-chip ${sb.person === p ? 'on' : ''}" data-act="sb-person" data-owner="${esc(p)}">${p ? esc(shortName(p)) : 'общее'}</button>`).join('')}</div>` : '';
    const schips = slots.length > 1 ? `<div class="wd-chips">${[{ k: 'all', t: 'Всё', i: '🗂' }, ...slots].map(sl => `<button class="wd-chip ${sb.slot === sl.k ? 'on' : ''}" data-act="sb-slot" data-slot="${sl.k}">${sl.i} ${esc(sl.t)}</button>`).join('')}</div>` : '';
    let body;
    if (!items.length) body = `<div class="wd-hint-soft">${sb.who ? `У ${esc(shortName(sb.who))} в шкафу${eraOn() ? ' этой эпохи' : ''} пока нет вещей.` : 'Шкаф пустой.'}</div>`;
    else if (sb.slot !== 'all') body = `<div class="wd-grid small">${items.filter(it => normSlot(it.slot) === sb.slot).map(card).join('')}</div>`;
    else body = slots.map(sl => {
        const its = items.filter(it => normSlot(it.slot) === sl.k);
        return `<div class="wd-sb-sec">${sl.i} ${esc(sl.t)} <small>${its.length}</small></div><div class="wd-grid small">${its.map(card).join('')}</div>`;
    }).join('');
    return `${pchips}${schips}${body}`;
}
const sbPaint = () => { const g = document.querySelector('#wd-panel [data-sb-grid]'); if (g) g.innerHTML = sbGrid(); };

/** Собрать образ из вещей шкафа (или поменять состав). */
function setBuilderModal(set = null, { owner, cat } = {}) {
    const who = set ? set.owner : (owner || defaultOwner());
    ui.sb = { who: who || '', slot: 'all', person: 'all', chosen: new Set(set?.itemIds || []) };
    const c = set ? set.cat || '' : (cat ?? (ui.tab === 'looks' && !['all', 'new', 'none'].includes(ui.lkCat) ? ui.lkCat : ''));
    openModal(set ? 'Состав образа' : 'Новый образ из шкафа', `
        <div class="wd-field"><label>Название</label><input type="text" data-input="setname" value="${esc(set?.name || '')}" placeholder="например: Хеди — дома, уютное"></div>
        <div class="wd-grid2">
            <div class="wd-field"><label>Чей</label>${ownerSelect(who || '', 'data-input="setowner"')}</div>
            <div class="wd-field"><label>Раздел</label>${catSelect(c, 'data-input="setcat"')}</div>
        </div>
        <div class="wd-sec">Вещи <small>(тапай, чтобы выбрать)</small></div>
        <div data-sb-grid>${sbGrid()}</div>
        <button class="wd-btn primary full" data-act="set-save" ${set ? `data-id="${esc(set.id)}"` : ''}><i class="fa-solid fa-check"></i> Сохранить образ</button>`);
}

// ───── обработчики ─────

async function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !document.getElementById('wd-panel')?.contains(el)) return;
    const act = el.dataset.act;
    const box = el.closest('.wd-modal');
    const s = settings();
    const id = el.dataset.id;
    const euid = el.dataset.uid;
    const name = el.dataset.name;

    switch (act) {
        case 'close': closePanel('кнопка ✕'); break;
        case 'tab': {
            const t = el.dataset.tab === 'sets' ? 'looks' : el.dataset.tab;
            if (t === 'looks' && ui.tab !== 'looks') { ui.prevTab = ui.tab; ui.lkWho = ui.who || ui.lkWho; }
            ui.tab = t;
            closeModal(); render(); break;
        }
        case 'who': ui.who = name; render(); break;
        case 'modal-close': closeModal(); break;

        case 'add-person': {
            openModal('Добавить в сцену', `<div class="wd-field"><label>Имя (NPC или персонаж не из группы)</label>
                <div class="wd-inline"><input type="text" data-input="pname" placeholder="Сэм"><button class="wd-btn primary" data-act="add-person-ok">OK</button></div></div>`);
            break;
        }
        case 'add-person-ok': {
            const n = box?.querySelector('[data-input="pname"]')?.value.trim();
            const w = chatState();
            if (n && w) { if (!w.extra.includes(n)) w.extra.push(n); charState(n); ui.who = n; closeModal(); commit({ manual: false }); }
            break;
        }
        case 'who-menu': {
            const w = chatState();
            openModal(esc(ui.who), menuList([
                ['face', 'fa-face-smile', `${s.faces[faceKey(ui.who)] ? 'Лицо для картинок (заменить)' : 'Лицо для картинок'}${faceKey(ui.who) !== ui.who ? ' · этого облика' : ''}`],
                ['strip', 'fa-person', 'Раздеть (📌, причёска и макияж останутся)'],
                ['wear-off-all', 'fa-arrow-up', 'Надеть обратно всё снятое'],
                ['save-as-set', 'fa-layer-group', 'Сохранить надетое как комплект'],
                ['dedupe', 'fa-object-group', 'Склеить дубли во всём чате'],
                ['wipe-who', 'fa-eraser', 'Очистить (ничего не записано)', '', true],
                w?.extra?.includes(ui.who) ? ['remove-person', 'fa-user-minus', 'Убрать из сцены', '', true] : null,
            ]));
            break;
        }
        case 'face': {
            const cur = s.faces[faceKey(ui.who)];
            const lbl = faceKey(ui.who) !== ui.who ? sliceLabel(ui.who) : '';
            openModal(`Лицо: ${esc(shortName(ui.who))}${lbl ? ` · ${esc(lbl)}` : ''}`, `
                <div class="wd-hint-soft">Это фото гардероб прикладывает, когда рисует вещи «на человеке» (лукбук, причёски, макияж). Лучше всего — лицо крупно, ровный свет, без других людей.${lbl ? ` Это лицо — только для облика «${esc(lbl)}»: в основной ролке и других эпохах — своё.` : ''}</div>
                <div class="wd-big" data-face="${esc(ui.who)}">${cur ? `<img src="${esc(cur)}" alt="">` : '<span>🙂</span>'}</div>
                <div class="wd-actions-row">
                    <label class="wd-btn primary"><i class="fa-solid fa-camera"></i> ${cur ? 'Заменить фото' : 'Загрузить фото'}<input type="file" accept="image/*" data-input="facefile" hidden></label>
                    ${cur ? '<button class="wd-btn danger" data-act="face-del"><i class="fa-solid fa-trash"></i> Убрать</button>' : ''}
                </div>`);
            break;
        }
        case 'face-del': { delete s.faces[faceKey(ui.who)]; saveSettings(); closeModal(); render(); break; }
        case 'strip': { stripClothes(charState(ui.who)); closeModal(); commit(); break; }
        case 'wear-off-all': { const st = charState(ui.who); st.worn.push(...st.off); st.off = []; closeModal(); commit(); break; }
        case 'wipe-who': { const st = charState(ui.who); st.worn = []; st.off = []; closeModal(); commit(); break; }
        case 'remove-person': { const w = chatState(); w.extra = w.extra.filter(x => x !== ui.who); delete w.chars[ui.who]; ui.who = ''; closeModal(); commit(); break; }
        case 'save-as-set': {
            const set = saveWornAsSet(ui.who);
            if (!set) break;
            closeModal();
            commit({ manual: false });
            setBuilderModal(set);
            break;
        }
        case 'dedupe': {
            const w = chatState();
            const n = w ? dedupeChars(w.chars, s.items, castNames(), parseAliases(s.aliases)) : 0;
            closeModal(); commit();
            toast('info', n ? `Склеила дублей: ${n}` : 'Дублей не нашла', '👗 Гардероб', { timeOut: 2500 });
            break;
        }
        case 'clear-off': { charState(ui.who).off = []; commit(); break; }
        case 'undo': undoLast(); break;

        case 'takeoff': {
            const f = findEntry(ui.who, euid);
            if (f && f.list === 'worn') { f.st.worn.splice(f.i, 1); f.st.off.push(f.e); }
            closeModal(); commit(); break;
        }
        case 'puton': {
            const f = findEntry(ui.who, euid);
            if (f && f.list === 'off') { f.st.off.splice(f.i, 1); f.st.worn.push(f.e); }
            closeModal(); commit(); break;
        }
        case 'entry-menu': entryMenu(euid); break;
        case 'entry-state': {
            const f = findEntry(ui.who, euid);
            if (f) f.e.state = box.querySelector('[data-input="state"]').value.trim();
            closeModal(); commit(); break;
        }
        case 'entry-rename': {
            const f = findEntry(ui.who, euid);
            const v = box.querySelector('[data-input="ename"]').value.trim();
            if (f && v) f.e.name = v;
            closeModal(); commit(); break;
        }
        case 'entry-del': {
            const f = findEntry(ui.who, euid);
            if (f) f.st[f.list].splice(f.i, 1);
            closeModal(); commit(); break;
        }
        case 'entry-save': {
            const f = findEntry(ui.who, euid);
            if (f) { const it = addToCloset({ ...f.e, owner: ui.who }); f.e.itemId = it.id; }
            closeModal(); commit({ manual: false });
            toast('success', 'В шкафу', '👗 Гардероб', { timeOut: 1500 });
            break;
        }
        case 'entry-give': {
            openModal('Отдать кому', personPicker('entry-give-to', `data-uid="${esc(euid)}"`));
            break;
        }
        case 'entry-give-to': {
            const f = findEntry(ui.who, euid);
            if (f && name && name !== ui.who) { f.st[f.list].splice(f.i, 1); charState(name).worn.push(f.e); }
            closeModal(); commit(); break;
        }

        case 'pick-closet': pickClosetModal(); break;
        case 'pick-wear': {
            wearItem(ui.who, closetItem(id));
            el.classList.add('on', 'wd-pop');
            commit();
            break;
        }
        case 'pick-set': {
            // «Образы» на «На них» — коллекция этого персонажа на весь экран
            ui.prevTab = ui.tab === 'looks' ? 'worn' : ui.tab;
            ui.lkWho = ui.who || '*';
            ui.lkCat = 'all';
            ui.tab = 'looks';
            closeModal(); render(); break;
        }
        case 'entry-pin': {
            const f = findEntry(ui.who, euid);
            if (f) setPinned(f.e.itemId || f.e.uid, !f.e.pinned);
            closeModal(); commit(); break;
        }
        case 'set-apply': {
            const set = s.sets.find(x => x.id === id);
            if (!set || !chatState()) break;
            applySets(name || ui.who, [set], { replaceAll: el.dataset.all === '1' });
            ui.who = name || ui.who;
            if (ui.tab !== 'looks') ui.tab = 'worn';
            closeModal(); commit();
            toast('success', `${esc(set.name)} → ${esc(shortName(name || ui.who))}`, '👗 Надето', { timeOut: 1800 });
            break;
        }

        case 'slot': ui.slot = el.dataset.slot; render(); break;
        case 'owner': ui.owner = el.dataset.owner; render(); break;
        case 'all-eras': ui.allEras = !ui.allEras; render(); break;
        case 'item-menu': itemMenu(id); break;
        case 'item-wear': {
            wearItem(name, closetItem(id));
            ui.who = name;
            closeModal(); commit();
            toast('success', `Надето: ${esc(shortName(name))}`, '👗 Гардероб', { timeOut: 1500 });
            break;
        }
        case 'item-save': {
            const it = closetItem(id);
            const f = readForm(box);
            if (it && f.name) {
                if (f.owner !== it.owner) retag(it, f.owner);
                Object.assign(it, { name: f.name, slot: normSlot(f.slot), owner: f.owner, desc: f.desc });
            }
            if (it && !!it.pinned !== f.pinned) { setPinned(it.id, f.pinned); saveChat(); updateInjection(); }
            saveSettings(); closeModal(); render(); break;
        }
        case 'item-del': {
            if (!confirm('Удалить вещь из шкафа? На персонажах она останется.')) break;
            s.items = s.items.filter(x => x.id !== id);
            for (const set of s.sets) set.itemIds = set.itemIds.filter(x => x !== id);
            saveSettings(); closeModal(); render(); break;
        }

        case 'new-item': newItemModal({ wearOn: ui.tab === 'worn' ? ui.who : '' }); break;
        case 'n-analyze': {
            const d = ui.draft;
            const text = box.querySelector('[data-input="ntext"]').value.trim();
            if (!text && !d?.dataUrl) { toast('info', 'Напиши что-нибудь или добавь фото', '👗 Гардероб'); break; }
            el.disabled = true;
            el.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Разбираю…';
            try {
                d.items = (await analyzeOutfit({ text, dataUrl: d.dataUrl })).map(x => ({ ...x, on: true }));
                renderProposed(box);
            } catch (e) {
                toast('warning', String(e.message || e), '👗 Гардероб', { timeOut: 6000 });
            } finally {
                el.disabled = false;
                el.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Разложить на вещи (ИИ)';
            }
            break;
        }
        case 'n-plain': {
            const d = ui.draft;
            const text = box.querySelector('[data-input="ntext"]').value.trim();
            if (!text) { toast('info', 'Напиши название вещи', '👗 Гардероб'); break; }
            const owner = box.querySelector('[data-input="nowner"]').value;
            const it = addToCloset({ name: text, slot: box.querySelector('[data-input="nslot"]').value, img: d?.img || '', owner });
            if (d?.wearOn) wearItem(d.wearOn, it);
            const drawIt = box.querySelector('[data-input="ndraw"]')?.checked && !d?.img;
            closeModal(); commit({ manual: !!d?.wearOn });
            if (drawIt) queueDraw([{ id: it.id }]);
            break;
        }
        case 'n-save': {
            const d = ui.draft;
            const list = readProposed(box);
            if (!list.length) break;
            const owner = box.querySelector('[data-input="nowner"]').value;
            const who = d.wearOn || ui.who;
            const created = list.map(x => addToCloset({ name: x.name, slot: x.slot, desc: x.desc, img: d.img || '', owner }));
            // одно фото одной вещи — оставляем фото; образ с фото — рисуем каждую вещь по этому фото; без фото — просто рисуем
            const drawJobs = box.querySelector('[data-input="ndraw"]')?.checked && !(d.img && created.length === 1)
                ? created.map(it => ({ id: it.id, ref: d.dataUrl || '' })) : [];
            if (el.dataset.wear && who) {
                // новый образ: вещи тех же типов снимаются (лежат рядом), 📌 остаётся
                wearOutfit(charState(who), created, { keepRemoved: true });
                ui.who = who;
                ui.tab = 'worn';
            }
            closeModal(); commit({ manual: !!el.dataset.wear });
            toast('success', `${created.length} в шкафу${drawJobs.length ? ' — рисую картинки' : ''}`, '👗 Гардероб', { timeOut: 2000 });
            if (drawJobs.length) queueDraw(drawJobs);
            break;
        }

        case 'item-draw': {
            const conn = imgConnection();
            if (conn.error) { toast('warning', esc(conn.error), '👗 Гардероб', { timeOut: 7000 }); break; }
            queueDraw([{ id }]);
            break;
        }
        case 'img-step': stepImage(id, Number(el.dataset.dir) || 1); break;
        case 'img-drop': {
            const obj = imgOwner(id);
            if (!obj) break;
            dropImg(obj);
            if (closetItem(id)) syncItemImg(obj);
            saveSettings();
            const big = box?.querySelector(`[data-draw-id="${CSS.escape(id)}"]`);
            if (big) big.innerHTML = obj.img ? `<img src="${esc(obj.img)}" alt="">` : `<span>${closetItem(id) ? slotOf(obj.slot).i : '🎽'}</span>`;
            paintGallery();
            render();
            break;
        }
        case 'draw-missing': {
            const conn = imgConnection();
            if (conn.error) { toast('warning', esc(conn.error), '👗 Гардероб', { timeOut: 7000 }); break; }
            const ids = s.items.filter(it => !it.img).map(it => it.id);
            if (!ids.length) break;
            if (!confirm(`Нарисовать ${ids.length} ${plural(ids.length, 'картинку', 'картинки', 'картинок')} через ${conn.apiType} (${conn.model})? Каждая — отдельный платный запрос.`)) break;
            queueDraw(ids.map(i => ({ id: i })));
            render();
            break;
        }
        case 'draw-shown': {
            const conn = imgConnection();
            if (conn.error) { toast('warning', esc(conn.error), '👗 Гардероб', { timeOut: 7000 }); break; }
            const ids = filteredItems().map(it => it.id);
            if (!ids.length) break;
            if (!confirm(`Перерисовать ${ids.length} ${plural(ids.length, 'картинку', 'картинки', 'картинок')} через ${conn.apiType} (${conn.model})? Старые картинки заменятся. Каждая — отдельный платный запрос.`)) break;
            queueDraw(ids.map(i => ({ id: i })));
            render();
            break;
        }
        case 'draw-stop': { drawStop = true; drawQ.length = 0; toast('info', 'Дорисую текущую и остановлюсь', '👗 Гардероб', { timeOut: 2500 }); break; }
        case 'set-draw': {
            const conn = imgConnection();
            if (conn.error) { toast('warning', esc(conn.error), '👗 Гардероб', { timeOut: 7000 }); break; }
            // из карточки образа модалку не закрываем: спиннер крутится прямо на большой картинке
            if (!box?.dataset.look) closeModal();
            queueDraw([{ kind: 'set', id }]);
            render();
            break;
        }

        case 'set-new': setBuilderModal(); break;
        case 'set-toggle': {
            el.classList.toggle('on');
            if (ui.sb) { if (el.classList.contains('on')) ui.sb.chosen.add(id); else ui.sb.chosen.delete(id); }
            break;
        }
        case 'sb-slot': if (ui.sb) { ui.sb.slot = el.dataset.slot || 'all'; sbPaint(); } break;
        case 'sb-person': if (ui.sb) { ui.sb.person = el.dataset.owner ?? 'all'; ui.sb.slot = 'all'; sbPaint(); } break;
        case 'set-save': {
            // выбранное помним в ui.sb: вещи скрытых разделов в разметке не лежат
            const ids = ui.sb ? s.items.filter(it => ui.sb.chosen.has(it.id)).map(it => it.id)
                : [...box.querySelectorAll('.wd-card.on')].map(x => x.dataset.id);
            const nm = box.querySelector('[data-input="setname"]').value.trim() || `Образ ${s.sets.length + 1}`;
            const owner = box.querySelector('[data-input="setowner"]').value;
            const cat = readCat(box, 'data-input="setcat"');
            const old = id ? s.sets.find(x => x.id === id) : null;
            if (old) {
                if (owner !== old.owner) retag(old, owner);
                Object.assign(old, { name: nm, owner, itemIds: ids, cat });
                if (nm) old.named = true;
            } else {
                const set = { id: uid(), name: nm, owner, itemIds: ids, cat, at: Date.now(), named: true };
                retag(set, owner);
                s.sets.unshift(set);
            }
            saveSettings();
            if (old && ui.tab === 'looks') { lookModal(old.id); render(); break; }
            closeModal(); render(); break;
        }
        case 'set-edit': setBuilderModal(s.sets.find(x => x.id === id)); break;
        case 'set-del': {
            if (!confirm('Удалить образ? Вещи останутся в шкафу.')) break;
            s.sets = s.sets.filter(x => x.id !== id);
            saveSettings(); closeModal(); render(); break;
        }

        // ───── коллекция образов ─────
        case 'look-back': { ui.tab = ui.prevTab && ui.prevTab !== 'looks' ? ui.prevTab : 'worn'; closeModal(); render(); break; }
        case 'look-who': {
            ui.lkWho = name || '*';
            if (name && name !== '*') ui.who = name;
            render(); break;
        }
        case 'look-cat': {
            const c = el.dataset.cat || 'all';
            ui.lkCat = ui.lkCat === c && c !== 'all' ? 'all' : c;
            render();
            document.querySelector('#wd-panel .wd-body')?.scrollTo?.({ top: 0 });
            break;
        }
        case 'look-add': lookAddModal(); break;
        case 'look-owner': ownerPickModal(id); break;
        case 'look-owner-set': {
            const set = s.sets.find(x => x.id === id);
            if (!set) break;
            const to = name || '';
            if (to !== set.owner) {
                retag(set, to);
                set.owner = to;
                saveSettings();
            }
            closeModal(); render();
            toast('success', esc(to ? `«${set.name}» — теперь у ${shortName(to)}` : `«${set.name}» — теперь общий`), '👗 Образы', { timeOut: 2200 });
            break;
        }
        case 'look-ownfix': {
            const moved = await runOwnerFix();
            render();
            toast(moved.length ? 'success' : 'info', esc(moved.length ? `Разобрала: ${ownerFixText(moved)}` : 'По названиям и вещам не понять, чьи остальные, — отдай их тапом по «общий».'), '👗 Образы', { timeOut: 6000 });
            break;
        }
        case 'to-look-add': {
            const owner = box?.querySelector('[data-input="nowner"]')?.value || '';
            if (ui.tab !== 'looks') ui.prevTab = ui.tab;
            ui.tab = 'looks';
            if (owner) ui.lkWho = owner; else if (!ui.lkWho) ui.lkWho = ui.who || '';
            closeModal(); render();
            lookAddModal(owner ? { owner } : {});
            break;
        }
        case 'look-open': {
            if (Date.now() - swipedAt < 400) break; // это был свайп по картинке, а не тап
            lookModal(id); break;
        }
        case 'look-retry': runImport(id); break;
        case 'look-from-worn': {
            const who = box?.querySelector('[data-input="lkowner"]')?.value || (ui.lkWho !== '*' ? ui.lkWho : '') || ui.who;
            if (!who) { toast('info', 'Выбери, чей образ', '👗 Гардероб'); break; }
            const set = saveWornAsSet(who);
            if (!set) break;
            ui.lkWho = who;
            commit({ manual: false });
            setBuilderModal(set);
            break;
        }
        case 'look-wear':
        case 'look-wear-all': {
            const set = s.sets.find(x => x.id === id);
            if (!set) break;
            if (!chatState()) { toast('info', 'Открой чат — тогда будет на кого надеть', '👗 Гардероб'); break; }
            if (!(set.itemIds || []).length) { toast('info', 'В образе пока нет вещей', '👗 Гардероб'); break; }
            const who = lookTarget(set);
            const all = act === 'look-wear-all';
            if (!who) { openModal('Надеть образ на', personPicker('set-apply', `data-id="${esc(id)}" data-all="${all ? 1 : 0}"`)); break; }
            applySets(who, [set], { replaceAll: all });
            ui.who = who;
            commit();
            if (box?.dataset.look) lookModal(id);
            toast('success', `${esc(set.name)} → ${esc(shortName(who))}${all ? ' (остальное снято)' : ''}`, '👗 Надето', { timeOut: 1800 });
            break;
        }
        case 'look-copy': {
            const set = s.sets.find(x => x.id === id);
            if (set) copyText(box?.dataset.look === id ? (box.querySelector('[data-f="prompt"]')?.value.trim() || lookPromptText(set)) : lookPromptText(set));
            break;
        }
        case 'look-save': {
            const set = s.sets.find(x => x.id === id);
            if (!set || !box) break;
            const f = readForm(box);
            const owner = f.owner;
            if (owner !== set.owner) retag(set, owner);
            else {
                // 1.8.7: эпоха руками (если владелец тот же)
                const sel = box.querySelector('[data-f="slice"]');
                if (sel) { if (sel.value) set.slice = sel.value; else delete set.slice; }
            }
            Object.assign(set, {
                name: f.name || set.name,
                owner,
                cat: readCat(box, 'data-f="cat"'),
                prompt: String(box.querySelector('[data-f="prompt"]')?.value || '').trim(),
            });
            set.named = true;
            saveSettings(); closeModal(); render();
            toast('success', 'Сохранено', '👗 Гардероб', { timeOut: 1200 });
            break;
        }
        case 'look-import': {
            const d = ui.draft;
            if (!d || !box) break;
            const text = box.querySelector('[data-input="lktext"]').value.trim();
            if (d.uploading) { toast('info', 'Фото ещё загружается — секунду', '👗 Гардероб', { timeOut: 2000 }); break; }
            if (!text && !d.img) { toast('info', 'Добавь фото образа или вставь промт', '👗 Гардероб', { timeOut: 2500 }); break; }
            if (!(s.visionProfile || s.watcherProfile)) { toast('warning', 'Сначала выбери в ⚙ профиль для фото — он разбирает образы', '👗 Гардероб', { timeOut: 5000 }); break; }
            const owner = box.querySelector('[data-input="lkowner"]').value;
            const cat = readCat(box, 'data-input="lkcat"');
            const nm = box.querySelector('[data-input="lkname"]').value.trim();
            const drawCover = !!box.querySelector('[data-input="lkcover"]')?.checked;
            const drawItems = !!box.querySelector('[data-input="lkitems"]')?.checked;
            const hair = !!box.querySelector('[data-input="lkhair"]')?.checked;
            Object.assign(s, { lkDrawCover: drawCover, lkDrawItems: drawItems, lkHair: hair });
            const set = {
                id: uid(),
                name: nm || (text && !d.img ? cut(text.replace(/\s+/g, ' '), 40) : 'Новый образ'),
                owner,
                itemIds: [],
                cat,
                at: Date.now(),
                pending: true,
                src: { ...(d.img ? { img: d.img } : {}), ...(text ? { text } : {}), ...(hair ? { look: true } : {}) },
                ...(nm ? { named: true } : {}),
            };
            retag(set, owner);
            if (d.img) pushImg(set, d.img);
            s.sets.unshift(set);
            saveSettings();
            const dataUrl = d.dataUrl;
            closeModal();
            if (owner) ui.lkWho = owner;
            if (!['all', 'new'].includes(ui.lkCat) && (!cat || catKey(cat) !== catKey(ui.lkCat))) ui.lkCat = 'all';
            render();
            document.querySelector('#wd-panel .wd-body')?.scrollTo?.({ top: 0 });
            runImport(set.id, { dataUrl, drawCover, drawItems });
            break;
        }
        case 'look-style': styleModal(); break;
        case 'style-pick': {
            const items = el.dataset.for === 'items';
            if (items) s.itemStyle = el.dataset.v || 'clover';
            else s.imgStyle = el.dataset.v || 'oil';
            saveSettings();
            closeModal();
            render();
            toast('info', `${items ? 'Вещи в шкафу' : 'Образы'}: стиль «${esc(styleShort(items ? itemView(s) : s))}». Новые картинки — в нём, старые листаются свайпом.`, '👗 Гардероб', { timeOut: 3000 });
            break;
        }
        case 'draw-looks-shown': {
            const conn = imgConnection();
            if (conn.error) { toast('warning', esc(conn.error), '👗 Гардероб', { timeOut: 7000 }); break; }
            const list = looksIn(looksShown(), ui.lkCat).filter(x => !x.pending && ((x.itemIds || []).length || x.prompt));
            if (!list.length) break;
            if (!confirm(`Перерисовать ${list.length} ${plural(list.length, 'образ', 'образа', 'образов')} в стиле «${styleShort(s)}» через ${conn.apiType} (${conn.model})? Каждый — отдельный платный запрос. Старые картинки останутся версиями.`)) break;
            closeModal();
            queueDraw(list.map(x => ({ kind: 'set', id: x.id })));
            render();
            break;
        }
        case 'look-autocat': {
            const list = looksIn(looksShown(), 'none').filter(x => !x.pending && !x.err);
            if (!list.length) break;
            el.disabled = true;
            el.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Раскладываю…';
            try {
                const n = await autoCategorize(list);
                toast('success', n ? `Разложила по разделам: ${n}` : 'Модель не поняла — попробуй ещё раз', '👗 Гардероб', { timeOut: 2500 });
            } catch (e) {
                toast('warning', esc(String(e?.message || e)), '👗 Гардероб', { timeOut: 6000 });
            }
            render();
            break;
        }

        case 'check-last': {
            const chat = ctx().chat || [];
            if (!chat.length) break;
            toast('info', 'Смотрю последнее сообщение…', '👗 Гардероб', { timeOut: 1500 });
            enqueue(chat.length - 1, { force: true });
            break;
        }
    }
}

async function onInput(ev) {
    const el = ev.target;
    if (!document.getElementById('wd-panel')?.contains(el)) return;
    const s = settings();
    // «＋ свой раздел…» в выборе раздела — показать поле для названия
    if (el.tagName === 'SELECT' && el.value === '__new' && ev.type === 'change') {
        const field = el.closest('.wd-field');
        if (field && !field.querySelector('[data-input="catnew"]')) {
            field.insertAdjacentHTML('beforeend', '<input type="text" data-input="catnew" placeholder="название раздела, например «Свадьба»" maxlength="40">');
            field.querySelector('[data-input="catnew"]')?.focus();
        }
        return;
    }
    if (el.dataset.set === 'cats') {
        // разделы образов: по одному в строке (или через запятую); пустой список — вернуть стандартные
        const list = catList(el.value);
        s.cats = list.length ? list : [...DEFAULT_CATS];
        saveSettings();
        return;
    }
    if (el.dataset.set) {
        const k = el.dataset.set;
        s[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(0, parseInt(el.value) || 0) : el.value;
        saveSettings();
        if (k === 'showFab') syncFab();
        if (['enabled', 'detail', 'depth', 'imgSource', 'imgStyle', 'itemStyle', 'imgProvider', 'imgNaisteraModel', 'imgAtlasModel'].includes(k) && ev.type === 'change') render();
        else updateInjection();
        return;
    }
    if (el.dataset.input === 'setowner' && ui.sb && ev.type === 'change') {
        ui.sb.who = el.value || '';
        ui.sb.person = 'all';
        ui.sb.slot = 'all';
        sbPaint();
        return;
    }
    if (el.dataset.input === 'q') {
        ui.q = el.value;
        const grid = document.querySelector('#wd-panel .wd-body .wd-grid');
        const items = filteredItems();
        if (grid) grid.innerHTML = items.map(it => itemCard(it)).join('');
        return;
    }
    if (el.dataset.input === 'pickq') {
        const q = norm(el.value);
        el.closest('.wd-modal').querySelectorAll('[data-pick-grid] .wd-card').forEach(card => {
            const it = closetItem(card.dataset.id);
            card.style.display = !q || norm(`${it?.name} ${it?.desc}`).includes(q) ? '' : 'none';
        });
        return;
    }
    if (el.dataset.input === 'facefile' && ev.type === 'change') {
        const file = el.files?.[0];
        const who = ui.who;
        if (!file || !who) return;
        const box = el.closest('.wd-modal');
        const big = box?.querySelector('.wd-big');
        if (big) big.classList.add('wd-drawing');
        try {
            const path = await uploadImage(await fileToDataUrl(file, 1024));
            s.faces[faceKey(who)] = path;
            faceWarned.delete(who);
            saveSettings();
            if (big) big.innerHTML = `<img src="${esc(path)}" alt="">`;
            render();
            toast('success', `Лицо ${esc(shortName(who))} сохранено`, '👗 Гардероб', { timeOut: 2000 });
        } catch (e) {
            toast('warning', esc(String(e.message || e)), '👗 Гардероб');
        } finally {
            big?.classList.remove('wd-drawing');
        }
        return;
    }
    if (el.dataset.input === 'lkfile' && ev.type === 'change') {
        // фото образа для импорта: превью сразу, на сервер — в фоне; ИИ получит уменьшенную копию
        const file = el.files?.[0];
        const d = ui.draft;
        if (!file || d?.kind !== 'look') return;
        const drop = el.closest('.wd-lk-drop');
        const prev = drop?.querySelector('.wd-lk-drop-prev');
        d.uploading = true;
        drop?.classList.add('has', 'wd-drawing');
        try {
            const big = await fileToDataUrl(file, 1400, 0.88);
            if (prev) prev.innerHTML = `<img src="${big}" alt="">`;
            d.dataUrl = await fileToDataUrl(file, 1024, 0.85);
            d.img = await uploadImage(big);
        } catch (e) {
            d.img = '';
            d.dataUrl = '';
            if (prev) prev.innerHTML = '';
            drop?.classList.remove('has');
            toast('warning', esc(String(e.message || e)), '👗 Гардероб');
        } finally {
            d.uploading = false;
            drop?.classList.remove('wd-drawing');
        }
        return;
    }
    if (el.dataset.input === 'lookfile' && ev.type === 'change') {
        // своё фото обложкой образа (прежние картинки остаются версиями)
        const file = el.files?.[0];
        const set = settings().sets.find(x => x.id === el.dataset.id);
        if (!file || !set) return;
        drawing.add(set.id);
        paintDrawing();
        try {
            pushImg(set, await uploadImage(await fileToDataUrl(file, 1400, 0.88)));
            saveSettings();
        } catch (e) {
            toast('warning', esc(String(e.message || e)), '👗 Гардероб');
        } finally {
            drawing.delete(set.id);
            paintDrawing();
        }
        return;
    }
    if (el.dataset.input === 'itemfile' && ev.type === 'change') {
        const file = el.files?.[0];
        const it = closetItem(el.dataset.id);
        if (!file || !it) return;
        drawing.add(it.id);
        paintDrawing();
        try {
            pushImg(it, await uploadImage(await fileToDataUrl(file, 1024)));
            it.drawn = false;
            syncItemImg(it);
            saveSettings();
        } catch (e) {
            toast('warning', esc(String(e.message || e)), '👗 Гардероб');
        } finally {
            drawing.delete(it.id);
            paintDrawing();
            render();
        }
        return;
    }
    if (el.dataset.input === 'nfile' && ev.type === 'change') {
        const file = el.files?.[0];
        if (!file || !ui.draft) return;
        const box = el.closest('.wd-modal');
        const prev = box.querySelector('.wd-photo-prev');
        prev.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            const dataUrl = await fileToDataUrl(file, 1024);
            ui.draft.dataUrl = await fileToDataUrl(file, 768, 0.82);
            prev.innerHTML = `<img src="${dataUrl}" alt="">`;
            ui.draft.img = await uploadImage(dataUrl);
        } catch (e) {
            prev.innerHTML = '';
            toast('warning', String(e.message || e), '👗 Гардероб');
        }
    }
}

// ───────────── плашка и кнопка ─────────────

function buildPanel() {
    if (document.getElementById('wd-panel')) return;
    const back = document.createElement('div');
    back.id = 'wd-backdrop';
    // закрываем только настоящим тапом по фону: палец должен опуститься именно на фон,
    // а не «призрачный» клик от тапа по кнопке, которым плашку только что открыли (iOS)
    let downOnBack = false;
    back.addEventListener('pointerdown', () => { downOnBack = Date.now() - openedAt > 450; });
    back.addEventListener('click', () => { if (downOnBack) closePanel('тап по фону'); downOnBack = false; });
    const panel = document.createElement('div');
    panel.id = 'wd-panel';
    panel.innerHTML = `
        <div class="wd-grab"></div>
        <div class="wd-head">
            <div class="wd-title"><span class="wd-logo">👗</span>Гардероб<small class="wd-ver">${VERSION}</small></div>
            <button class="wd-x" data-act="close" title="Закрыть"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wd-tabs">
            <button class="wd-tab" data-act="tab" data-tab="worn"><i class="fa-solid fa-person-dress"></i><span>На них</span></button>
            <button class="wd-tab" data-act="tab" data-tab="closet"><i class="fa-solid fa-box-archive"></i><span>Шкаф</span></button>
            <button class="wd-tab" data-act="tab" data-tab="looks"><i class="fa-solid fa-layer-group"></i><span>Образы</span></button>
            <button class="wd-tab" data-act="tab" data-tab="cfg"><i class="fa-solid fa-gear"></i></button>
        </div>
        <div class="wd-body"></div>
        <div class="wd-modal-host"></div>`;
    // плашка живёт в <dialog>, открытом через showModal(): это «верхний слой» браузера,
    // его не может перекрыть ни одна тема или расширение, какой бы z-index у них ни был
    const dlg = document.createElement('dialog');
    dlg.id = 'wd-dialog';
    dlg.append(back, panel);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closePanel('Esc'); });
    document.body.append(dlg);
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', onInput);

    // свайп влево/вправо по картинке образа — листать её версии (масло ↔ карандаш ↔ исходное фото)
    let sw = null;
    panel.addEventListener('touchstart', e => {
        const el = e.target.closest?.('.wd-lk-img[data-gal]');
        sw = el && Number(el.dataset.gal) > 1 && e.touches.length === 1 ? { id: el.dataset.id, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    panel.addEventListener('touchend', e => {
        if (!sw) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
        const id = sw.id;
        sw = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipedAt = Date.now(); stepImage(id, dx < 0 ? 1 : -1); }
    }, { passive: true });

    // свайп вниз по шапке закрывает плашку (телефон)
    let y0 = null;
    const head = panel.querySelector('.wd-grab');
    const headBar = panel.querySelector('.wd-head');
    for (const h of [head, headBar]) {
        h.addEventListener('touchstart', e => { y0 = Date.now() - openedAt > 450 ? e.touches[0].clientY : null; }, { passive: true });
        h.addEventListener('touchend', e => {
            if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) closePanel('свайп вниз');
            y0 = null;
        }, { passive: true });
    }
}

let openedAt = 0;
let swipedAt = 0;

/** Один раз на чат после обновления: склеить дубли, которые набежали в старых версиях. */
function autoDedupeOnce() {
    const w = chatState();
    if (!w || w.dd162) return;
    const s = settings();
    const n = dedupeChars(w.chars, s.items, castNames(), parseAliases(s.aliases));
    w.dd162 = true;
    saveChat();
    if (n) {
        updateInjection();
        toast('info', `Склеила дублей: ${n}`, '👗 Гардероб', { timeOut: 3000 });
    }
}

function openPanel(tab) {
    openedAt = Date.now();
    try { autoDedupeOnce(); } catch (e) { console.warn('[Гардероб] склейка', e); }
    try {
        buildPanel();
        if (tab === 'sets') tab = 'looks'; // Life и старые кнопки зовут «sets»
        if (tab === 'looks' && ui.tab !== 'looks') ui.prevTab = ui.tab || 'worn';
        if (tab) ui.tab = tab;
        if (ui.tab === 'looks' && !ui.lkWho) ui.lkWho = ui.who || '';
        ui.open = true;
        render();
        const dlg = document.getElementById('wd-dialog');
        if (dlg && !dlg.open) {
            if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
        }
    } catch (e) {
        console.error('[Гардероб] open', e);
        toast('error', esc(String(e?.message || e)), '👗 Гардероб: ошибка', { timeOut: 15000 });
    }
    // двойной кадр: iOS иначе пропускает анимацию и плашка остаётся за экраном
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('wd-backdrop')?.classList.add('on');
        document.getElementById('wd-panel')?.classList.add('on');
    }));
    if (settings().debug === true) diagnoseOpen();
}

/** Через 1,5 с после открытия: если плашки не видно — сказать почему (для отладки на телефоне). */
function diagnoseOpen() {
    const t0 = openedAt;
    closeReason = '';
    const panel = document.getElementById('wd-panel');
    const events = [];
    const mo = panel ? new MutationObserver(ms => {
        for (const m of ms) {
            if (m.type === 'attributes') events.push(`${m.attributeName}="${String(panel.getAttribute(m.attributeName) || '').slice(0, 60)}" @${Date.now() - t0}мс`);
        }
    }) : null;
    mo?.observe(panel, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    const removed = new MutationObserver(() => { if (panel && !panel.isConnected) events.push(`плашку удалили из страницы @${Date.now() - t0}мс`); });
    removed.observe(document.body, { childList: true });
    setTimeout(() => {
        mo?.disconnect();
        removed.disconnect();
        if (!panel || openedAt !== t0) return;
        const r = panel.getBoundingClientRect();
        const cs = getComputedStyle(panel);
        const shown = panel.isConnected && panel.classList.contains('on') && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1 && r.top < window.innerHeight - 40 && r.height > 40;
        let top = '';
        if (shown) {
            const el = document.elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight - 20, r.top + Math.min(r.height / 2, 200)));
            if (el && !panel.contains(el)) top = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
        }
        if (shown && !top) return; // всё хорошо
        const msg = [
            shown ? `плашка открыта, но её перекрывает: ${top}` : 'плашку не видно',
            closeReason ? `закрыла сама: ${closeReason}` : 'closePanel не вызывался',
            `класс: "${panel.className}", display:${cs.display}, opacity:${cs.opacity}, transform:${cs.transform.slice(0, 40)}`,
            `rect: top ${Math.round(r.top)} h ${Math.round(r.height)} / окно ${window.innerHeight}`,
            ...events.slice(0, 6),
        ].join('<br>');
        toast('warning', esc(msg).replace(/&lt;br&gt;/g, '<br>'), `👗 Гардероб ${VERSION}: диагностика`, { timeOut: 0, extendedTimeOut: 0, closeButton: true, escapeHtml: false });
    }, 1500);
}

let closeReason = '';

function closePanel(reason = 'неизвестно') {
    closeReason = `${typeof reason === 'string' ? reason : 'клик'} через ${Date.now() - openedAt} мс`;
    ui.open = false;
    closeModal();
    document.querySelector('#wd-panel .wd-toasts')?.replaceChildren();
    document.getElementById('wd-backdrop')?.classList.remove('on');
    document.getElementById('wd-panel')?.classList.remove('on');
    const t = openedAt;
    setTimeout(() => {
        const dlg = document.getElementById('wd-dialog');
        if (dlg?.open && openedAt === t && !ui.open) dlg.close();
    }, 380);
}

function togglePanel() {
    const shown = document.getElementById('wd-panel')?.classList.contains('on');
    if (shown && Date.now() - openedAt > 450) closePanel('кнопка 👗'); else if (!shown) openPanel();
}

function syncFab() {
    const s = settings();
    let fab = document.getElementById('wd-fab');
    if (!s.showFab) { fab?.remove(); return; }
    if (fab) return;
    fab = document.createElement('div');
    fab.id = 'wd-fab';
    fab.title = 'Гардероб';
    fab.innerHTML = '<span>👗</span>';
    document.body.append(fab);
    if (s.fabPos) { fab.style.right = `${s.fabPos.r}px`; fab.style.bottom = `${s.fabPos.b}px`; }

    // перетаскивание пальцем/мышью; короткое касание — открыть
    let start = null;
    fab.addEventListener('pointerdown', e => {
        const r = fab.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY, r: window.innerWidth - r.right, b: window.innerHeight - r.bottom, moved: false };
        fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener('pointermove', e => {
        if (!start) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 8) return;
        start.moved = true;
        const r = Math.min(Math.max(4, start.r - dx), window.innerWidth - 56);
        const b = Math.min(Math.max(4, start.b - dy), window.innerHeight - 56);
        fab.style.right = `${r}px`;
        fab.style.bottom = `${b}px`;
    });
    fab.addEventListener('pointerup', () => {
        if (!start) return;
        if (start.moved) {
            settings().fabPos = { r: parseInt(fab.style.right) || 14, b: parseInt(fab.style.bottom) || 150 };
            saveSettings();
        } else togglePanel();
        start = null;
    });
}

function addWandButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('wd-wand')) return !!menu;
    const btn = document.createElement('div');
    btn.id = 'wd-wand';
    btn.className = 'list-group-item flex-container flexGap5 interactable';
    btn.tabIndex = 0;
    btn.innerHTML = '<div class="fa-solid fa-shirt extensionsMenuExtensionButton"></div><span>Гардероб</span>';
    btn.addEventListener('click', () => openPanel());
    menu.append(btn);
    return true;
}

function renderSettingsDrawer() {
    const s = settings();
    $('#extensions_settings2').append(`
    <div id="wardrobe_settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header"><b>👗 Гардероб</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
        <div class="inline-drawer-content">
          <label class="checkbox_label"><input id="wd_set_enabled" type="checkbox" ${s.enabled ? 'checked' : ''}> Включено</label>
          <label class="checkbox_label"><input id="wd_set_fab" type="checkbox" ${s.showFab ? 'checked' : ''}> Плавающая кнопка 👗</label>
          <div id="wd_open_btn" class="menu_button"><i class="fa-solid fa-shirt"></i> Открыть гардероб</div>
          <small>Все настройки — во вкладке ⚙ самой плашки. Команда: <code>/wardrobe</code>.</small>
        </div>
      </div>
    </div>`);
    $('#wd_set_enabled').on('change', function () { s.enabled = this.checked; saveSettings(); updateInjection(); });
    $('#wd_set_fab').on('change', function () { s.showFab = this.checked; saveSettings(); syncFab(); });
    $('#wd_open_btn').on('click', () => openPanel());
}

function registerSlash() {
    try {
        const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = ctx();
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wardrobe',
            aliases: ['гардероб'],
            helpString: 'Гардероб: без аргумента — открыть плашку; looks (образы) — коллекция образов на весь экран; check — проверить последнее сообщение; on / off — включить или выключить.',
            unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'looks | check | on | off', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })],
            callback: async (_a, value) => {
                const v = String(value || '').trim().toLowerCase();
                if (v === 'on' || v === 'off') { settings().enabled = v === 'on'; saveSettings(); updateInjection(); return ''; }
                if (v === 'check') { const n = (ctx().chat || []).length; if (n) enqueue(n - 1, { force: true }); return ''; }
                if (['looks', 'образы', 'sets', 'комплекты'].includes(v)) { openPanel('looks'); return ''; }
                openPanel();
                return '';
            },
        }));
    } catch (e) { console.warn('[Гардероб] команда не зарегистрирована', e); }
}

// ───────────── API для других расширений (Life) ─────────────
// Только то, что и так делают кнопки плашки: надеть комплект, открыть плашку, нарисовать обложку.
window.Wardrobe = Object.freeze({
    version: VERSION,
    wearSets(who, setIds, { replaceAll = false } = {}) {
        const s = settings();
        const sets = (setIds || []).map(id => s.sets.find(x => x.id === id)).filter(Boolean);
        if (!who || !sets.length || !chatState()) return false;
        applySets(who, sets, { replaceAll });
        commit();
        return true;
    },
    /** tab: worn | closet | looks (старое «sets» = looks) | cfg. who — чей гардероб/коллекцию показать. */
    open(tab, who) { if (who) { ui.who = who; ui.lkWho = who; } openPanel(tab); },
    /** Коллекция образов на весь экран: чья и какой раздел («Офис», «Вечернее»…). */
    openLooks(who, cat) { if (who) { ui.who = who; ui.lkWho = who; } if (cat) ui.lkCat = cat; openPanel('looks'); },
    /** Комплекты (образы), которые видно в этом чате (облик эпохи + общие) — для Life. Неразобранные — не отдаём. */
    setsFor(who) { return settings().sets.filter(x => !x.pending && inEra(x, true) && (!who || !x.owner || x.owner === who)); },
    /** Разделы образов (Офис, Вечернее, Спортивное…). */
    cats() { return [...settings().cats]; },
    /** Облик владельца в этом чате (ядро «Священный таймлайн»): { identity, slice, label } | null. */
    sliceOf(name) { return people()[name] || null; },
    drawSet(setId) {
        const conn = imgConnection();
        if (conn.error) throw new Error(conn.error);
        queueDraw([{ kind: 'set', id: setId }]);
    },
    isDrawing(id) { return drawing.has(id); },
});

window.addEventListener('error', (e) => {
    if (String(e?.filename || '').includes('/wardrobe/')) toast('error', esc(`${e.message} (${String(e.filename).split('/').pop()}:${e.lineno})`), '👗 Гардероб: ошибка', { timeOut: 15000 });
});

jQuery(async () => {
    const s0 = settings();
    // разбор образа, прерванный перезагрузкой страницы, — показать «повторить», а не вечный спиннер
    let stale = 0;
    for (const set of s0.sets) if (set.pending) { delete set.pending; set.err = 'разбор прервался — нажми, чтобы повторить'; stale++; }
    if (stale) saveSettings();
    renderSettingsDrawer();
    registerSlash();
    syncFab();
    if (!addWandButton()) {
        let tries = 0;
        const t = setInterval(() => { if (addWandButton() || ++tries > 20) clearInterval(t); }, 500);
    }
    const { eventSource, eventTypes } = ctx();
    migrateSlices().catch(e => console.warn('[Гардероб] облики', e));
    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        ui.who = '';
        ui.allEras = false;
        dropEraMemo();
        closeModal();
        migrateSlices().catch(e => console.warn('[Гардероб] облики', e));
        try { autoDedupeOnce(); } catch (e) { console.warn('[Гардероб] склейка', e); }
        updateInjection();
        render();
    });
    eventSource.on(eventTypes.MESSAGE_RECEIVED, (mesId, type) => {
        if (type === 'impersonate') return;
        const id = Number(mesId);
        const m = ctx().chat?.[id];
        if (m && !m.is_user) enqueue(id);
    });
    eventSource.on(eventTypes.MESSAGE_SWIPED, (mesId) => onSwiped(Number(mesId)));
    // ядро узнало эпоху и облики этого чата — шкаф показывает своё
    eventSource.on('sacred-timeline:changed', () => {
        dropEraMemo();   // 1.8.7: снимок новый — полсекундная память о прошлом не в счёт
        migrateSlices().catch(e => console.warn('[Гардероб] облики', e)); // ядро могло проснуться позже чата
        if (ui.open) render();
    });
    eventSource.on(eventTypes.MESSAGE_DELETED, (len) => onDeleted(len));
    if (eventTypes.GROUP_UPDATED) eventSource.on(eventTypes.GROUP_UPDATED, () => { updateInjection(); render(); });
    if (eventTypes.APP_READY) eventSource.on(eventTypes.APP_READY, () => { addWandButton(); updateInjection(); });
    updateInjection();
    console.log(`[Гардероб] загружен ${VERSION}`);
});
