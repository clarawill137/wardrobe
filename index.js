// 👗 Гардероб — шкаф вещей, комплекты и трекер «кто во что одет» для SillyTavern.
// Работает и в групповых чатах. Состояние чата хранится в метаданных чата (ветки копируют его сами),
// шкаф и комплекты — общие для всех чатов (extension_settings.wardrobe).
// Костюмер (модель через профиль подключения) после каждого сообщения смотрит, кто что снял или надел,
// и обновляет трекер. На свайпах и удалениях изменения откатываются.

import {
    SLOTS, slotOf, normSlot, uid, esc, cut, norm, clone, cleanText, extractJson,
    CLOTHES_RE, entryFromItem, newEntry, sortBySlot, buildInjection,
    WATCHER_SYSTEM, buildWatcherInput, applyChanges, ANALYZE_SYSTEM, parseAnalyzed, parseAliases,
} from './core.js';

const MODULE = 'wardrobe';
const PROMPT_KEY = 'wardrobe_state';
const VERSION = '1.0.4';

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
    aliases: 'Bucky Barnes = Баки, Барнс, Джеймс\nNatasha Romanoff = Наташа, Нат, Романофф\nТони Старк = Тони, Старк, Tony',
    items: [],
    sets: [],
};

const ctx = () => SillyTavern.getContext();

function settings() {
    const ext = ctx().extensionSettings;
    if (!ext[MODULE]) ext[MODULE] = {};
    const s = ext[MODULE];
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = clone(v);
    if (!Array.isArray(s.items)) s.items = [];
    if (!Array.isArray(s.sets)) s.sets = [];
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

function avatarUrl(name) {
    const c = ctx();
    if (name === c.name1) {
        const img = document.querySelector('#chat .mes[is_user="true"] .avatar img');
        return img?.getAttribute('src') || '';
    }
    const ch = (c.characters || []).find(x => x.name === name);
    return ch?.avatar ? `/thumbnail?type=avatar&file=${encodeURIComponent(ch.avatar)}` : '';
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

async function ask(profileName, messages, maxTokens) {
    const s = settings();
    const c = ctx();
    if (!c.ConnectionManagerRequestService?.sendRequest) throw new Error('в таверне нет Connection Manager');
    const id = profileName ? findProfileId(profileName) : null;
    if (!id) throw new Error(`выбери профиль подключения в ⚙ гардероба`);
    const override = s.effort ? { reasoning_effort: s.effort } : {};
    const r = await withTimeout(
        c.ConnectionManagerRequestService.sendRequest(id, messages, Number(maxTokens) || 1500, {}, override),
        (Number(s.timeoutSec) || 60) * 1000,
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
    const { text: input, map } = buildWatcherInput(w.chars, cast, s.items, { prev, message: text, speaker: m.name });

    setFabBusy(true);
    let notes = [];
    try {
        const out = await ask(s.watcherProfile, [{ role: 'system', content: WATCHER_SYSTEM }, { role: 'user', content: input }], s.watcherTokens);
        const j = extractJson(out);
        if (!j) throw new Error('костюмер ответил не JSON');
        notes = applyChanges(w.chars, j.changes || [], map, s.items, cast, parseAliases(s.aliases));
    } catch (e) {
        console.warn('[Гардероб] костюмер:', e);
        window.toastr?.warning(String(e.message || e), '👗 Гардероб', { timeOut: 5000 });
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
        window.toastr?.info(esc(notes.join('\n')).replace(/\n/g, '<br>'), '👗 Гардероб', { timeOut: 6000, escapeHtml: false, onclick: () => openPanel('worn') });
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
    window.toastr?.info('Вернула как было до последнего сообщения', '👗 Гардероб', { timeOut: 2500 });
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
    if (!r.ok) throw new Error(`картинка не загрузилась (${r.status})`);
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

// ───────────── операции ─────────────

function closetItem(id) { return settings().items.find(x => x.id === id); }

function addToCloset({ name, slot, desc = '', img = '', owner = '' }) {
    const it = { id: uid(), name: cut(name, 80) || 'вещь', slot: normSlot(slot), desc: String(desc || '').trim(), img, owner, at: Date.now() };
    settings().items.unshift(it);
    saveSettings();
    return it;
}

function wearItem(who, it) {
    const st = charState(who);
    if (!st || !it) return;
    if (st.worn.some(e => e.itemId && e.itemId === it.id)) return;
    const off = st.off.findIndex(e => e.itemId && e.itemId === it.id);
    if (off >= 0) st.worn.push(st.off.splice(off, 1)[0]);
    else st.worn.push(entryFromItem(it));
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

function applySet(who, set) {
    const st = charState(who);
    if (!st || !set) return;
    st.worn = set.itemIds.map(closetItem).filter(Boolean).map(entryFromItem);
    st.off = [];
}

// ───────────── интерфейс ─────────────

const ui = { open: false, tab: 'worn', who: '', q: '', slot: 'all', owner: 'all', draft: null };

function profileOptions(selected, empty = '— выбери профиль —') {
    return `<option value="">${esc(empty)}</option>`
        + profiles().map(p => `<option value="${esc(p.name)}" ${p.name === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

function thumb(e, cls = 'wd-thumb') {
    const sl = slotOf(e.slot);
    return `<div class="${cls}" data-slot="${esc(sl.k)}">${e.img ? `<img src="${esc(e.img)}" alt="" loading="lazy">` : `<span>${sl.i}</span>`}</div>`;
}

function avatar(name, size = '') {
    const url = avatarUrl(name);
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
    const action = list === 'worn'
        ? `<button class="wd-mini" data-act="takeoff" data-uid="${esc(e.uid)}" title="Снять"><i class="fa-solid fa-arrow-down"></i><span>снять</span></button>`
        : `<button class="wd-mini" data-act="puton" data-uid="${esc(e.uid)}" title="Надеть"><i class="fa-solid fa-arrow-up"></i><span>надеть</span></button>`;
    return `<div class="wd-row ${list === 'off' ? 'is-off' : ''}">
        ${thumb(e)}
        <div class="wd-row-main" data-act="entry-menu" data-uid="${esc(e.uid)}">
            <div class="wd-row-name">${esc(e.name)}${e.itemId ? '' : ' <i class="wd-new" title="Нет в шкафу">новое</i>'}</div>
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
        <button class="wd-btn" data-act="pick-set"><i class="fa-solid fa-layer-group"></i> Комплект</button>
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
    return settings().items.filter(it =>
        (ui.slot === 'all' || it.slot === ui.slot)
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
    </div>`;
}

function itemCard(it, act = 'item-menu') {
    const sl = slotOf(it.slot);
    return `<button class="wd-card" data-act="${act}" data-id="${esc(it.id)}">
        ${thumb(it, 'wd-card-img')}
        <div class="wd-card-name">${esc(it.name)}</div>
        <div class="wd-card-meta">${sl.i} ${esc(sl.t)}${it.owner ? ` · ${esc(shortName(it.owner))}` : ''}</div>
    </button>`;
}

function renderCloset() {
    const items = filteredItems();
    return `<div class="wd-actions-row">
        <button class="wd-btn primary" data-act="new-item"><i class="fa-solid fa-plus"></i> Новая вещь или образ</button>
    </div>
    ${closetFilters()}
    ${items.length ? `<div class="wd-grid">${items.map(it => itemCard(it)).join('')}</div>`
        : `<div class="wd-empty"><div class="wd-empty-ico">🧺</div>${settings().items.length ? 'Ничего не нашлось.' : 'Шкаф пустой. Добавь вещь текстом, промптом образа или фоткой — ИИ разложит на вещи.'}</div>`}`;
}

function renderSets() {
    const s = settings();
    return `<div class="wd-actions-row">
        <button class="wd-btn primary" data-act="set-new"><i class="fa-solid fa-plus"></i> Собрать комплект</button>
    </div>
    ${s.sets.length ? `<div class="wd-sets">${s.sets.map(set => {
        const its = set.itemIds.map(closetItem).filter(Boolean);
        return `<div class="wd-set">
            <div class="wd-set-head">
                <div><div class="wd-set-name">${esc(set.name)}</div><div class="wd-row-meta">${its.length} ${plural(its.length, 'вещь', 'вещи', 'вещей')}${set.owner ? ` · ${esc(set.owner)}` : ''}</div></div>
                <button class="wd-dots" data-act="set-menu" data-id="${esc(set.id)}"><i class="fa-solid fa-ellipsis"></i></button>
            </div>
            <div class="wd-set-items">${its.map(it => `<div class="wd-set-item" title="${esc(it.name)}">${thumb(it, 'wd-set-thumb')}<span>${esc(cut(it.name, 26))}</span></div>`).join('')}</div>
            <button class="wd-btn primary full" data-act="set-wear" data-id="${esc(set.id)}"><i class="fa-solid fa-shirt"></i> Надеть на…</button>
        </div>`;
    }).join('')}</div>`
        : `<div class="wd-empty"><div class="wd-empty-ico">🎽</div>Комплектов нет. Собери из вещей шкафа или сохрани то, что сейчас надето на персонаже (меню ⋮ у персонажа).</div>`}`;
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
        <div class="wd-actions-row">
            <button class="wd-btn" data-act="check-last"><i class="fa-solid fa-magnifying-glass"></i> Проверить последнее сообщение</button>
        </div>
        <div class="wd-field"><label>Что сейчас видит модель</label><pre class="wd-pre">${esc(preview || '— пусто: ни на ком ничего не записано —')}</pre></div>
        <div class="wd-foot">Гардероб ${VERSION} · <code>/wardrobe</code> открывает эту плашку</div>
    </div>`;
}

function render() {
    const panel = document.getElementById('wd-panel');
    if (!panel || !ui.open) return;
    panel.querySelectorAll('.wd-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
    const body = panel.querySelector('.wd-body');
    const scroll = body.scrollTop;
    try {
        body.innerHTML = ui.tab === 'closet' ? renderCloset()
            : ui.tab === 'sets' ? renderSets()
                : ui.tab === 'cfg' ? renderCfg()
                    : renderWorn();
    } catch (e) {
        console.error('[Гардероб] render', e);
        body.innerHTML = `<div class="wd-empty"><div class="wd-empty-ico">🧯</div><b>Ошибка гардероба</b><pre class="wd-pre" style="text-align:left">${esc(String(e?.stack || e).slice(0, 900))}</pre>Сделай скрин и кинь Claude.</div>`;
    }
    body.scrollTop = scroll;
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
            ['entry-give', 'fa-hand-holding', 'Отдать другому персонажу', `data-uid="${esc(e.uid)}"`],
            e.itemId ? null : ['entry-save', 'fa-box-archive', 'Сохранить в шкаф', `data-uid="${esc(e.uid)}"`],
            ['entry-del', 'fa-trash', 'Убрать совсем', `data-uid="${esc(e.uid)}"`, true],
        ])}`);
}

function itemMenu(id) {
    const it = closetItem(id);
    if (!it) return;
    openModal(esc(it.name), `
        ${it.img ? `<img class="wd-big-img" src="${esc(it.img)}" alt="">` : ''}
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

function ownerSelect(value, attr = 'data-f="owner"') {
    return `<select ${attr}><option value="" ${!value ? 'selected' : ''}>общее</option>${ownersList().map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
}

function itemForm(it) {
    return `<div class="wd-field"><label>Название</label><input type="text" data-f="name" value="${esc(it.name)}"></div>
        <div class="wd-grid2">
            <div class="wd-field"><label>Тип</label>${slotSelect(it.slot)}</div>
            <div class="wd-field"><label>Чьё</label>${ownerSelect(it.owner)}</div>
        </div>
        <div class="wd-field"><label>Описание</label><textarea rows="3" data-f="desc">${esc(it.desc)}</textarea></div>`;
}

function readForm(box) {
    const v = (f) => box.querySelector(`[data-f="${f}"]`)?.value ?? '';
    return { name: v('name').trim(), slot: v('slot'), owner: v('owner'), desc: v('desc').trim() };
}

/** Новая вещь / образ: текст, промпт или фото → ИИ раскладывает на вещи. */
function newItemModal({ wearOn = '' } = {}) {
    ui.draft = { dataUrl: '', img: '', items: [], wearOn };
    openModal('Новая вещь или образ', `
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
    const items = settings().items;
    const mine = items.filter(it => !it.owner || it.owner === who);
    const rest = items.filter(it => it.owner && it.owner !== who);
    openModal(`Из шкафа → ${esc(shortName(who))}`, items.length ? `
        <div class="wd-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Поиск" data-input="pickq"></div>
        <div class="wd-grid small" data-pick-grid>${[...mine, ...rest].map(it => itemCard(it, 'pick-wear')).join('')}</div>
        <div class="wd-hint-soft">Тапни вещь — она сразу наденется. Можно тапать несколько.</div>`
        : `<div class="wd-empty"><div class="wd-empty-ico">🧺</div>Шкаф пустой.</div>
           <button class="wd-btn primary full" data-act="new-item"><i class="fa-solid fa-plus"></i> Добавить вещь</button>`);
}

function pickSetModal() {
    const sets = settings().sets;
    openModal(`Комплект → ${esc(shortName(ui.who))}`, sets.length
        ? `<div class="wd-hint-soft">Всё, что надето сейчас, заменится комплектом.</div>${menuList(sets.map(set => ['set-apply', 'fa-layer-group', esc(set.name), `data-id="${esc(set.id)}" data-name="${esc(ui.who)}"`]))}`
        : `<div class="wd-empty"><div class="wd-empty-ico">🎽</div>Комплектов ещё нет.</div>`);
}

function setBuilderModal(set = null) {
    const chosen = new Set(set?.itemIds || []);
    openModal(set ? 'Комплект' : 'Новый комплект', `
        <div class="wd-field"><label>Название</label><input type="text" data-input="setname" value="${esc(set?.name || '')}" placeholder="например: Хеди — дома, уютное"></div>
        <div class="wd-field"><label>Чей</label>${ownerSelect(set?.owner || '', 'data-input="setowner"')}</div>
        <div class="wd-sec">Вещи <small>(тапай, чтобы выбрать)</small></div>
        <div class="wd-grid small">${settings().items.map(it => `<button class="wd-card ${chosen.has(it.id) ? 'on' : ''}" data-act="set-toggle" data-id="${esc(it.id)}">${thumb(it, 'wd-card-img')}<div class="wd-card-name">${esc(it.name)}</div></button>`).join('')}</div>
        <button class="wd-btn primary full" data-act="set-save" ${set ? `data-id="${esc(set.id)}"` : ''}><i class="fa-solid fa-check"></i> Сохранить комплект</button>`);
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
        case 'tab': ui.tab = el.dataset.tab; closeModal(); render(); break;
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
                ['strip', 'fa-person', 'Раздеть (всё снять)'],
                ['wear-off-all', 'fa-arrow-up', 'Надеть обратно всё снятое'],
                ['save-as-set', 'fa-layer-group', 'Сохранить надетое как комплект'],
                ['wipe-who', 'fa-eraser', 'Очистить (ничего не записано)', '', true],
                w?.extra?.includes(ui.who) ? ['remove-person', 'fa-user-minus', 'Убрать из сцены', '', true] : null,
            ]));
            break;
        }
        case 'strip': { const st = charState(ui.who); st.off.push(...st.worn); st.worn = []; closeModal(); commit(); break; }
        case 'wear-off-all': { const st = charState(ui.who); st.worn.push(...st.off); st.off = []; closeModal(); commit(); break; }
        case 'wipe-who': { const st = charState(ui.who); st.worn = []; st.off = []; closeModal(); commit(); break; }
        case 'remove-person': { const w = chatState(); w.extra = w.extra.filter(x => x !== ui.who); delete w.chars[ui.who]; ui.who = ''; closeModal(); commit(); break; }
        case 'save-as-set': {
            const st = charState(ui.who);
            if (!st.worn.length) { window.toastr?.info('На нём ничего нет', '👗 Гардероб'); break; }
            const ids = st.worn.map(e => {
                if (e.itemId && closetItem(e.itemId)) return e.itemId;
                const it = addToCloset({ name: e.name, slot: e.slot, desc: e.desc, img: e.img, owner: ui.who });
                e.itemId = it.id;
                return it.id;
            });
            const set = { id: uid(), name: `${shortName(ui.who)} — образ ${s.sets.length + 1}`, owner: ui.who, itemIds: ids };
            s.sets.unshift(set);
            saveSettings();
            closeModal();
            commit({ manual: false });
            setBuilderModal(set);
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
            window.toastr?.success('В шкафу', '👗 Гардероб', { timeOut: 1500 });
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
        case 'pick-set': pickSetModal(); break;
        case 'set-apply': {
            applySet(name || ui.who, s.sets.find(x => x.id === id));
            ui.who = name || ui.who;
            ui.tab = 'worn';
            closeModal(); commit(); break;
        }

        case 'slot': ui.slot = el.dataset.slot; render(); break;
        case 'owner': ui.owner = el.dataset.owner; render(); break;
        case 'item-menu': itemMenu(id); break;
        case 'item-wear': {
            wearItem(name, closetItem(id));
            ui.who = name;
            closeModal(); commit();
            window.toastr?.success(`Надето: ${esc(shortName(name))}`, '👗 Гардероб', { timeOut: 1500 });
            break;
        }
        case 'item-save': {
            const it = closetItem(id);
            const f = readForm(box);
            if (it && f.name) Object.assign(it, { name: f.name, slot: normSlot(f.slot), owner: f.owner, desc: f.desc });
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
            if (!text && !d?.dataUrl) { window.toastr?.info('Напиши что-нибудь или добавь фото', '👗 Гардероб'); break; }
            el.disabled = true;
            el.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Разбираю…';
            try {
                d.items = (await analyzeOutfit({ text, dataUrl: d.dataUrl })).map(x => ({ ...x, on: true }));
                renderProposed(box);
            } catch (e) {
                window.toastr?.warning(String(e.message || e), '👗 Гардероб', { timeOut: 6000 });
            } finally {
                el.disabled = false;
                el.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Разложить на вещи (ИИ)';
            }
            break;
        }
        case 'n-plain': {
            const d = ui.draft;
            const text = box.querySelector('[data-input="ntext"]').value.trim();
            if (!text) { window.toastr?.info('Напиши название вещи', '👗 Гардероб'); break; }
            const owner = box.querySelector('[data-input="nowner"]').value;
            const it = addToCloset({ name: text, slot: box.querySelector('[data-input="nslot"]').value, img: d?.img || '', owner });
            if (d?.wearOn) wearItem(d.wearOn, it);
            closeModal(); commit({ manual: !!d?.wearOn });
            break;
        }
        case 'n-save': {
            const d = ui.draft;
            const list = readProposed(box);
            if (!list.length) break;
            const owner = box.querySelector('[data-input="nowner"]').value;
            const who = d.wearOn || ui.who;
            const created = list.map(x => addToCloset({ name: x.name, slot: x.slot, desc: x.desc, img: d.img || '', owner }));
            if (el.dataset.wear && who) {
                const st = charState(who);
                // новый образ: то, что надето в тех же «ячейках» (верх, низ, обувь…), снимаем, потом надеваем всё новое
                const slots = new Set(created.map(it => it.slot).filter(k => !['acc', 'other', 'hair'].includes(k)));
                for (const e of [...st.worn]) {
                    if (slots.has(normSlot(e.slot))) { st.worn.splice(st.worn.indexOf(e), 1); st.off.push(e); }
                }
                for (const it of created) wearItem(who, it);
                ui.who = who;
                ui.tab = 'worn';
            }
            closeModal(); commit({ manual: !!el.dataset.wear });
            window.toastr?.success(`${created.length} в шкафу`, '👗 Гардероб', { timeOut: 1500 });
            break;
        }

        case 'set-new': setBuilderModal(); break;
        case 'set-toggle': el.classList.toggle('on'); break;
        case 'set-save': {
            const ids = [...box.querySelectorAll('.wd-card.on')].map(x => x.dataset.id);
            const nm = box.querySelector('[data-input="setname"]').value.trim() || `Комплект ${s.sets.length + 1}`;
            const owner = box.querySelector('[data-input="setowner"]').value;
            const old = id ? s.sets.find(x => x.id === id) : null;
            if (old) Object.assign(old, { name: nm, owner, itemIds: ids });
            else s.sets.unshift({ id: uid(), name: nm, owner, itemIds: ids });
            saveSettings(); closeModal(); render(); break;
        }
        case 'set-menu': {
            const set = s.sets.find(x => x.id === id);
            if (!set) break;
            openModal(esc(set.name), menuList([
                ['set-edit', 'fa-pen', 'Изменить', `data-id="${esc(id)}"`],
                ['set-del', 'fa-trash', 'Удалить комплект', `data-id="${esc(id)}"`, true],
            ]));
            break;
        }
        case 'set-edit': setBuilderModal(s.sets.find(x => x.id === id)); break;
        case 'set-del': { s.sets = s.sets.filter(x => x.id !== id); saveSettings(); closeModal(); render(); break; }
        case 'set-wear': {
            openModal('Надеть комплект на', personPicker('set-apply', `data-id="${esc(id)}"`));
            break;
        }

        case 'check-last': {
            const chat = ctx().chat || [];
            if (!chat.length) break;
            window.toastr?.info('Смотрю последнее сообщение…', '👗 Гардероб', { timeOut: 1500 });
            enqueue(chat.length - 1, { force: true });
            break;
        }
    }
}

async function onInput(ev) {
    const el = ev.target;
    if (!document.getElementById('wd-panel')?.contains(el)) return;
    const s = settings();
    if (el.dataset.set) {
        const k = el.dataset.set;
        s[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(0, parseInt(el.value) || 0) : el.value;
        saveSettings();
        if (k === 'showFab') syncFab();
        if (['enabled', 'detail', 'depth'].includes(k) && ev.type === 'change') render();
        else updateInjection();
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
            window.toastr?.warning(String(e.message || e), '👗 Гардероб');
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
            <div class="wd-title"><span class="wd-logo">👗</span>Гардероб</div>
            <button class="wd-x" data-act="close" title="Закрыть"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wd-tabs">
            <button class="wd-tab" data-act="tab" data-tab="worn"><i class="fa-solid fa-person-dress"></i><span>На них</span></button>
            <button class="wd-tab" data-act="tab" data-tab="closet"><i class="fa-solid fa-box-archive"></i><span>Шкаф</span></button>
            <button class="wd-tab" data-act="tab" data-tab="sets"><i class="fa-solid fa-layer-group"></i><span>Комплекты</span></button>
            <button class="wd-tab" data-act="tab" data-tab="cfg"><i class="fa-solid fa-gear"></i></button>
        </div>
        <div class="wd-body"></div>
        <div class="wd-modal-host"></div>`;
    document.body.append(back, panel);
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', onInput);

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

function openPanel(tab) {
    openedAt = Date.now();
    try {
        buildPanel();
        if (tab) ui.tab = tab;
        ui.open = true;
        render();
    } catch (e) {
        console.error('[Гардероб] open', e);
        window.toastr?.error(esc(String(e?.message || e)), '👗 Гардероб: ошибка', { timeOut: 15000 });
    }
    // двойной кадр: iOS иначе пропускает анимацию и плашка остаётся за экраном
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('wd-backdrop')?.classList.add('on');
        document.getElementById('wd-panel')?.classList.add('on');
    }));
    if (settings().debug !== false) diagnoseOpen();
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
        window.toastr?.warning(esc(msg).replace(/&lt;br&gt;/g, '<br>'), `👗 Гардероб ${VERSION}: диагностика`, { timeOut: 0, extendedTimeOut: 0, closeButton: true, escapeHtml: false });
    }, 1500);
}

let closeReason = '';

function closePanel(reason = 'неизвестно') {
    closeReason = `${typeof reason === 'string' ? reason : 'клик'} через ${Date.now() - openedAt} мс`;
    ui.open = false;
    closeModal();
    document.getElementById('wd-backdrop')?.classList.remove('on');
    document.getElementById('wd-panel')?.classList.remove('on');
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
            helpString: 'Гардероб: без аргумента — открыть плашку; check — проверить последнее сообщение; on / off — включить или выключить.',
            unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'check | on | off', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })],
            callback: async (_a, value) => {
                const v = String(value || '').trim().toLowerCase();
                if (v === 'on' || v === 'off') { settings().enabled = v === 'on'; saveSettings(); updateInjection(); return ''; }
                if (v === 'check') { const n = (ctx().chat || []).length; if (n) enqueue(n - 1, { force: true }); return ''; }
                openPanel();
                return '';
            },
        }));
    } catch (e) { console.warn('[Гардероб] команда не зарегистрирована', e); }
}

window.addEventListener('error', (e) => {
    if (String(e?.filename || '').includes('/wardrobe/')) window.toastr?.error(esc(`${e.message} (${String(e.filename).split('/').pop()}:${e.lineno})`), '👗 Гардероб: ошибка', { timeOut: 15000 });
});

jQuery(async () => {
    settings();
    renderSettingsDrawer();
    registerSlash();
    syncFab();
    if (!addWandButton()) {
        let tries = 0;
        const t = setInterval(() => { if (addWandButton() || ++tries > 20) clearInterval(t); }, 500);
    }
    const { eventSource, eventTypes } = ctx();
    eventSource.on(eventTypes.CHAT_CHANGED, () => { ui.who = ''; closeModal(); updateInjection(); render(); });
    eventSource.on(eventTypes.MESSAGE_RECEIVED, (mesId, type) => {
        if (type === 'impersonate') return;
        const id = Number(mesId);
        const m = ctx().chat?.[id];
        if (m && !m.is_user) enqueue(id);
    });
    eventSource.on(eventTypes.MESSAGE_SWIPED, (mesId) => onSwiped(Number(mesId)));
    eventSource.on(eventTypes.MESSAGE_DELETED, (len) => onDeleted(len));
    if (eventTypes.GROUP_UPDATED) eventSource.on(eventTypes.GROUP_UPDATED, () => { updateInjection(); render(); });
    if (eventTypes.APP_READY) eventSource.on(eventTypes.APP_READY, () => { addWandButton(); updateInjection(); });
    updateInjection();
    console.log(`[Гардероб] загружен ${VERSION}`);
});
