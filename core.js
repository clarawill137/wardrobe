// 👗 Гардероб — чистая логика без DOM (тестируется в node).

export const SLOTS = [
    { k: 'outer', t: 'Верхняя одежда', i: '🧥' },
    { k: 'dress', t: 'Платье / комбинезон', i: '👗' },
    { k: 'top', t: 'Верх', i: '👚' },
    { k: 'bottom', t: 'Низ', i: '👖' },
    { k: 'under', t: 'Бельё', i: '🩱' },
    { k: 'legwear', t: 'Носки / колготки', i: '🧦' },
    { k: 'shoes', t: 'Обувь', i: '👢' },
    { k: 'head', t: 'Головной убор', i: '👒' },
    { k: 'acc', t: 'Аксессуары', i: '💍' },
    { k: 'hair', t: 'Причёска', i: '💇‍♀️' },
    { k: 'makeup', t: 'Макияж', i: '💄' },
    { k: 'other', t: 'Другое', i: '✨' },
];
/** Не одежда, а «образ»: причёска и макияж. */
export const LOOK_SLOTS = ['hair', 'makeup'];
export const isLook = (k) => LOOK_SLOTS.includes(k);
export const SLOT_KEYS = SLOTS.map(s => s.k);
export const slotOf = (k) => SLOTS.find(s => s.k === k) || SLOTS[SLOTS.length - 1];
export const normSlot = (k) => (SLOT_KEYS.includes(String(k || '').trim()) ? String(k).trim() : 'other');

export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function cut(t, n) {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
}

export function clone(o) {
    return JSON.parse(JSON.stringify(o ?? null));
}

export function cleanText(t) {
    return String(t || '')
        .replace(/<(think|thinking)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<details[\s\S]*?<\/details>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Слова, без которых в сообщении точно нет переодеваний (экономим запросы). */
export const CLOTHES_RE = /(сн[яи]л|сним|снима|стян|стяг|разд[еа]|раздев|переод|од[еі]л|одев|одет|над[еео]л|надев|натян|накин|наброс|расст[её]г|заст[её]г|гол(ая|ый|ые|ой)|наг(ая|ой|ие)|обнаж|пальт|куртк|пиджак|жакет|плащ|шуб|рубаш|футболк|майк|кофт|свитер|худи|толстовк|водолазк|блуз|топ\b|плать|сарафан|юбк|брюк|джинс|штан|шорт|леггинс|бель[ея]|лифчик|бюстгал|трус|стринг|носк|колгот|чулк|ботин|туфл|кроссов|кед|сапог|тапк|тапоч|халат|пижам|ночнушк|полотенц|шарф|шапк|кепк|перчат|галстук|рем[ее]н|ремн|пуговиц|молни|ширинк|бретел|волос|прич[её]с|кос[уы]\b|косич|хвост|пучок|распуст|заплел|заколк|резинк|макияж|накрас|помад|туш[ья]|стрелк|смыл|умыл|румян|тени\b|undress|naked|took off|put on|strip|hair|makeup|lipstick)/iu;

/** Достаёт первый JSON-объект из ответа модели (с ```json и болтовнёй вокруг). */
export function extractJson(text) {
    const s = String(text || '').replace(/<(think|thinking)[^>]*>[\s\S]*?<\/\1>/gi, '');
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1] : s;
    const a = body.indexOf('{');
    const b = body.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    const raw = body.slice(a, b + 1);
    try { return JSON.parse(raw); } catch { /* попробуем подчистить */ }
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); } catch { return null; }
}

export function entryFromItem(it) {
    const e = { uid: uid(), itemId: it.id || null, name: it.name, slot: normSlot(it.slot), desc: it.desc || '', img: it.img || '', state: '' };
    if (it.pinned) e.pinned = true;
    return e;
}

// ───── похожие названия: «черная сумка-тоут Хеди» = «чёрная сумка-тоут» ─────

const STOP = new Set(['с', 'со', 'и', 'на', 'в', 'во', 'из', 'для', 'по', 'под', 'над', 'от', 'до', 'без', 'к', 'у', 'её', 'ее', 'его', 'их', 'свой', 'своя', 'свои', 'the', 'a', 'an', 'with', 'and', 'of', 'in']);
const ENDINGS = /(ого|его|ому|ему|ыми|ими|ами|ями|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ым|им|ых|их|ах|ях|ов|ев|ей|ам|ям|ом|ем|а|я|о|е|ы|и|у|ю|ь)$/;

/** Корни значимых слов названия, без имён персонажей. */
export function nameKey(name, ownerWords = []) {
    return norm(name).replace(/[«»"'.,;:!?()\[\]\-–—/+]/g, ' ').split(/\s+/)
        .filter(w => w.length > 1 && !STOP.has(w) && !ownerWords.includes(w))
        .map(w => (w.length > 4 ? w.replace(ENDINGS, '') : w).slice(0, 6));
}

const slotsCompatible = (a, b) => {
    const x = normSlot(a), y = normSlot(b);
    return x === y || x === 'other' || y === 'other';
};

/** 0…1: какая доля слов короткого названия есть в длинном (тот же тип вещи обязателен). */
export function sameThing(a, b, ownerWords = []) {
    if (!slotsCompatible(a.slot, b.slot)) return 0;
    const A = new Set(nameKey(a.name, ownerWords));
    const B = new Set(nameKey(b.name, ownerWords));
    if (!A.size || !B.size) return 0;
    let n = 0;
    for (const x of A) if (B.has(x)) n++;
    return n / Math.min(A.size, B.size);
}

/**
 * Та же вещь? Сравниваем название новой вещи с названием И описанием известной:
 * «свободные брюки овсяного оттенка» = «свободные шерстяные брюки» (в описании: «…овсяного оттенка»).
 * Чтобы описание не давало ложных совпадений, хотя бы одно слово названия известной вещи должно совпасть.
 */
export function matchScore(want, known, ownerWords = []) {
    const byName = sameThing(want, known, ownerWords);
    if (!slotsCompatible(want.slot, known.slot)) return 0;
    const W = [...new Set(nameKey(want.name, ownerWords))];
    if (W.length < 2) return byName;
    const N = new Set(nameKey(known.name, ownerWords));
    if (!W.some(w => N.has(w))) return byName;
    const E = new Set([...N, ...nameKey(String(known.desc || '').slice(0, 220), ownerWords)]);
    const cover = W.filter(w => E.has(w)).length / W.length;
    return Math.max(byName, cover);
}

const SAME = 0.75;
const SINGLE = ['hair', 'makeup']; // причёска и макияж — по одной на персонажа

const TR = [['ck', 'к'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['th', 'т'], ['kh', 'х'], ['ya', 'я'], ['yu', 'ю'],
    ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'дж'], ['k', 'к'],
    ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'],
    ['w', 'у'], ['x', 'кс'], ['y', 'и'], ['z', 'з']];
/** Hedy → хеди, Barlow → барлоу: чтобы «сумка Хеди» узнавалась у персонажа с латинским именем. */
export function translit(w) {
    let s = String(w || '').toLowerCase();
    if (!/[a-z]/.test(s)) return s;
    for (const [a, b] of TR) s = s.split(a).join(b);
    return s;
}

/** Все слова, которыми называют персонажа: имя карточки, прозвища, транслит. */
export function charWords(name, aliases = {}) {
    const out = new Set();
    const add = (t) => { for (const w of norm(t).split(/[\s,]+/)) if (w.length > 1) { out.add(w); out.add(translit(w)); } };
    add(name);
    for (const [n, list] of Object.entries(aliases || {})) {
        if (norm(n) === norm(name) || list.some(a => norm(name).split(/\s+/).includes(a))) { add(n); list.forEach(add); }
    }
    return out;
}

/** Слова, которые выкидываем при сравнении: имена персонажей и их прозвища. */
export function ownerWordsOf(names = [], aliases = {}) {
    const out = new Set();
    for (const n of new Set([...names, ...Object.keys(aliases || {})])) for (const w of charWords(n, aliases)) out.add(w);
    return [...out];
}

/** Название вещи упоминает персонажа («сумка Хеди», «куртка Баки»)? */
export function mentionsChar(itemName, charName, aliases = {}) {
    const words = charWords(charName, aliases);
    return norm(itemName).split(/[\s«»"'.,;:!?()\-–—/]+/).some(w => words.has(w) || words.has(w.replace(/(а|ы|ой|у|е)$/, '')));
}

/**
 * Можно ли считать, что вещь перешла от другого персонажа, а не что у двоих просто похожие вещи:
 * она у него лежит рядом (снята), или в названии упомянут он, или по шкафу это вещь нового владельца.
 */
export function canTake({ list, entry, wantName, from, to, closet = [], aliases = {} }) {
    if (list === 'off') return true;
    if (mentionsChar(wantName, from, aliases)) return true;
    const owner = entry?.itemId ? (closet || []).find(x => x.id === entry.itemId)?.owner : '';
    return !!owner && norm(owner) === norm(to);
}

/** Найти вещь по id шкафа у любого персонажа и вынуть её оттуда (вещь одна — не копируем). */
export function detachItem(chars, itemId, exceptWorn = null) {
    if (!itemId) return null;
    for (const st of Object.values(chars || {})) {
        for (const list of ['worn', 'off']) {
            const arr = st?.[list] || [];
            const i = arr.findIndex(e => e.itemId === itemId);
            if (i >= 0 && arr !== exceptWorn) return arr.splice(i, 1)[0];
        }
    }
    return null;
}

/** Платье конфликтует с верхом и низом: надел платье — снимаются топ и брюки, и наоборот. */
const CONFLICT = { dress: ['top', 'bottom'], top: ['dress'], bottom: ['dress'] };

/**
 * Надеть набор вещей (один или несколько комплектов сразу).
 * Обычный режим: заменяются только вещи тех же типов, что есть в наборе (бельё не трогает основной образ и наоборот).
 * replaceAll: снять всю остальную одежду (причёска и макияж остаются, если их нет в наборе). Закреплённые (pinned) вещи не снимаются никогда.
 * keepRemoved: снятое кладётся «рядом» (off), иначе убирается (оно и так в шкафу).
 * Возвращает список снятых записей.
 */
export function wearOutfit(st, items, { replaceAll = false, keepRemoved = false } = {}) {
    const incoming = [];
    const seen = new Set();
    for (const it of items || []) if (it && !seen.has(it.id)) { seen.add(it.id); incoming.push(it); }
    const ids = new Set(incoming.map(it => it.id));
    const slots = new Set();
    for (const it of incoming) {
        const k = normSlot(it.slot);
        slots.add(k);
        for (const x of CONFLICT[k] || []) slots.add(x);
    }
    const removed = [];
    st.worn = (st.worn || []).filter(e => {
        if (e.pinned) return true;
        if (e.itemId && ids.has(e.itemId)) return true;
        const k = normSlot(e.slot);
        // «переодеть полностью» меняет одежду; причёску и макияж — только если они есть в наборе
        if (slots.has(k) || (replaceAll && !isLook(k))) { removed.push(e); return false; }
        return true;
    });
    st.off = (st.off || []).filter(e => !(e.itemId && ids.has(e.itemId)) && (!replaceAll || e.pinned));
    if (keepRemoved) st.off.push(...removed);
    for (const it of incoming) if (!st.worn.some(e => e.itemId === it.id)) st.worn.push(entryFromItem(it));
    return removed;
}

/** «Раздеть»: снять одежду, но оставить закреплённое (кольца, пирсинг), причёску и макияж. */
export function stripClothes(st) {
    const keep = [];
    const off = [];
    for (const e of st.worn || []) (e.pinned || isLook(normSlot(e.slot)) ? keep : off).push(e);
    st.worn = keep;
    st.off = [...(st.off || []), ...off];
    return off;
}

export function newEntry({ name, slot, desc = '', img = '' }) {
    return { uid: uid(), itemId: null, name: String(name || '').trim() || 'вещь', slot: normSlot(slot), desc, img, state: '' };
}

export function sortBySlot(list) {
    return [...(list || [])].sort((a, b) => SLOT_KEYS.indexOf(normSlot(a.slot)) - SLOT_KEYS.indexOf(normSlot(b.slot)));
}

export function fmtEntry(e, detail = true) {
    let t = e.name;
    if (e.state) t += ` [${e.state}]`;
    if (detail && e.desc) t += ` — ${cut(e.desc, 130).replace(/[.;,\s]+$/, '')}`;
    return t;
}

/** Текст, который уходит основной модели. chars: { имя: { worn, off } }, cast: порядок имён. */
export function buildInjection(chars, cast, { detail = true } = {}) {
    const names = [...cast];
    for (const n of Object.keys(chars || {})) if (!names.includes(n)) names.push(n);
    const lines = [];
    for (const name of names) {
        const st = chars?.[name];
        if (!st || (!st.worn?.length && !st.off?.length)) continue;
        const worn = sortBySlot(st.worn);
        const clothes = worn.filter(e => !isLook(normSlot(e.slot)));
        const offClothes = (st.off || []).filter(e => !isLook(normSlot(e.slot)));
        const parts = [];
        if (clothes.length) parts.push(clothes.map(e => fmtEntry(e, detail)).join('; '));
        else if (offClothes.length) parts.push('ничего не надето');
        const hair = worn.filter(e => normSlot(e.slot) === 'hair');
        const makeup = worn.filter(e => normSlot(e.slot) === 'makeup');
        if (hair.length) parts.push(`Причёска: ${hair.map(e => fmtEntry(e, detail)).join('; ')}`);
        if (makeup.length) parts.push(`Макияж: ${makeup.map(e => fmtEntry(e, detail)).join('; ')}`);
        else if ((st.off || []).some(e => normSlot(e.slot) === 'makeup')) parts.push('Макияж смыт');
        let line = `• ${name}: ${parts.join('. ')}`;
        if (offClothes.length) line += `. Снято и лежит рядом: ${offClothes.map(e => e.name).join(', ')}`;
        lines.push(line + '.');
    }
    if (!lines.length) return '';
    return '[ГАРДЕРОБ — что СЕЙЧАС на персонажах: одежда, причёска, макияж. Это факт сцены: описывай строго так, не путай вещи между персонажами и не переодевай никого сам. Снятое не возвращается, пока его снова не наденут в тексте. Если в посте кто-то переодевается, раздевается, меняет причёску или смывает макияж — пиши это явно.]\n'
        + lines.join('\n');
}

export const WATCHER_SYSTEM = `Ты — костюмер ролевой истории. Тебе дают текущий гардероб персонажей и новое сообщение. Найди, изменилась ли одежда кого-то В ЭТОМ сообщении, и верни изменения строго в JSON.
Правила:
- Меняй только то, что реально произошло в тексте сейчас: снял(а), надел(а), разделся, переоделся, расстегнул, порвал, промок, накинул чужую вещь. Воспоминания, планы, мысли, желания, сравнения — НЕ изменения.
- remove — id надетых вещей (из worn), которые сняли. Они не исчезают, а лежат рядом.
- wear — id вещей, которые надели: из off этого персонажа, из worn/off ДРУГОГО персонажа (передал, отдал, взял, накинул чужое — вещь перейдёт к нему) или из шкафа (closet).
- add — ТОЛЬКО совсем новые вещи, которых нет нигде: ни у кого в worn/off и ни в шкафу. {"name": "короткое название по-русски: цвет, материал, фасон", "slot": одно из [outer, dress, top, bottom, under, legwear, shoes, head, acc, hair, makeup, other]}.
- Сначала сверь каждую упомянутую в тексте вещь с гардеробом и шкафом по названию И описанию (desc).
- Текст часто описывает уже известную вещь другими словами («тоут», «её сумка», «помада цвета шоколада» при уже записанном макияже) — это та же вещь: используй её id или ничего не делай. Не добавляй её ещё раз через add и не добавляй имя владельца в название.
- Причёска (slot hair) и макияж (slot makeup) — тоже «вещи»: распустила хвост, заплела косу → remove старую причёску + add новую; смыла макияж → remove; размазалась тушь, растрепались волосы → state.
- state — пометка на надетой вещи: {"id": "...", "state": "расстёгнута"}; пустая строка снимает пометку.
- discard — id вещей, которые испорчены, выброшены или остались где-то насовсем.
- «Разделся догола» = remove всех его worn, КРОМЕ закреплённых (pinned), причёски (hair) и макияжа (makeup).
- pinned: true — постоянные вещи (обручальное кольцо, пирсинг, жетоны): снимай их, только если в тексте прямо сказано, что сняли именно эту вещь.
- Переоделся в другое = remove старого + wear/add нового. Причёска и макияж — по одной на персонажа: новая причёска или новый макияж = remove старого + add нового.
- who — имя персонажа как в гардеробе. Если вещь надел персонаж, которого нет в гардеробе, всё равно укажи его имя.
- note — 2–6 слов, что случилось («Баки снял куртку»).
- Нет изменений — {"changes": []}.
Ответ — только JSON без пояснений:
{"changes":[{"who":"Имя","remove":[],"wear":[],"add":[],"state":[],"discard":[],"note":""}]}`;

/**
 * Готовит вход для костюмера: короткие id вместо uid, шкаф с id.
 * Возвращает { text, map } — map: короткий id → { kind: 'entry'|'closet', who?, uid?, itemId? }.
 */
export function buildWatcherInput(chars, cast, closet, { prev = '', message = '', speaker = '' } = {}) {
    const map = {};
    let n = 0;
    const wardrobe = {};
    const names = [...cast];
    for (const k of Object.keys(chars || {})) if (!names.includes(k)) names.push(k);
    for (const name of names) {
        const st = chars?.[name] || { worn: [], off: [] };
        const pack = (list) => (list || []).map(e => {
            const id = `w${++n}`;
            map[id] = { kind: 'entry', who: name, uid: e.uid };
            const o = { id, name: e.name, slot: normSlot(e.slot) };
            if (e.desc) o.desc = cut(e.desc, 90);
            if (e.state) o.state = e.state;
            if (e.pinned) o.pinned = true;
            return o;
        });
        wardrobe[name] = { worn: pack(st.worn), off: pack(st.off) };
    }
    const shelf = (closet || []).slice(0, 120).map((it, i) => {
        const id = `c${i + 1}`;
        map[id] = { kind: 'closet', itemId: it.id };
        return `${id}: ${it.name}${it.owner ? ` (${it.owner})` : ''}`;
    });
    const text = `ГАРДЕРОБ СЕЙЧАС (JSON):\n${JSON.stringify(wardrobe)}\n\n`
        + (shelf.length ? `ШКАФ (можно надеть по id):\n${shelf.join('\n')}\n\n` : '')
        + (prev ? `ПРЕДЫДУЩЕЕ СООБЩЕНИЕ (только для контекста, изменения в нём уже учтены):\n${cut(prev, 2500)}\n\n` : '')
        + `НОВОЕ СООБЩЕНИЕ${speaker ? ` [${speaker}]` : ''}:\n${cut(message, 9000)}\n\nВерни JSON с изменениями одежды в НОВОМ сообщении.`;
    return { text, map };
}

function findWho(chars, cast, who, aliases = {}) {
    const w = norm(who);
    if (!w) return null;
    const all = [...cast, ...Object.keys(chars)];
    for (const [name, list] of Object.entries(aliases || {})) {
        if (list.some(a => a && (w === a || w.startsWith(a)))) return all.find(n => norm(n) === norm(name)) || name;
    }
    return all.find(n => norm(n) === w)
        || all.find(n => norm(n).startsWith(w) || w.startsWith(norm(n)))
        || all.find(n => norm(n).split(/\s+/).includes(w.split(/\s+/)[0]))
        || null;
}

const asArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Применяет изменения костюмера к chars (мутирует). Возвращает список коротких заметок для тоста.
 */
export function applyChanges(chars, changes, map, closet, cast = [], aliases = {}) {
    const notes = [];
    const ownerWords = ownerWordsOf([...cast, ...Object.keys(chars || {})], aliases);
    const byId = (id) => map[String(id || '').trim()];
    for (const ch of asArr(changes)) {
        if (!ch || typeof ch !== 'object') continue;
        // имя не совпало (модель написала «Баки» вместо «Bucky Barnes») — берём владельца упомянутых вещей
        const ownerOfRefs = [...asArr(ch.remove), ...asArr(ch.discard), ...asArr(ch.state).map(s => s?.id)]
            .map(id => byId(id)).find(r => r?.kind === 'entry')?.who;
        const who = findWho(chars, cast, ch.who, aliases) || ownerOfRefs || String(ch.who || '').trim();
        if (!who) continue;
        chars[who] ||= { worn: [], off: [] };
        const me = chars[who];
        const done = [];
        const locate = (ref) => {
            if (!ref || ref.kind !== 'entry') return null;
            const owner = chars[ref.who];
            if (!owner) return null;
            for (const listName of ['worn', 'off']) {
                const i = owner[listName].findIndex(e => e.uid === ref.uid);
                if (i >= 0) return { owner, listName, i, e: owner[listName][i] };
            }
            return null;
        };
        for (const id of asArr(ch.remove)) {
            const f = locate(byId(id));
            if (f && f.listName === 'worn') {
                f.owner.worn.splice(f.i, 1);
                f.owner.off.push(f.e);
                done.push(`−${f.e.name}`);
            }
        }
        for (const id of asArr(ch.discard)) {
            const f = locate(byId(id));
            if (f) { f.owner[f.listName].splice(f.i, 1); done.push(`✕${f.e.name}`); }
        }
        for (const id of asArr(ch.wear)) {
            const ref = byId(id);
            if (ref?.kind === 'closet') {
                const it = (closet || []).find(x => x.id === ref.itemId);
                if (it && !me.worn.some(e => e.itemId === it.id)) {
                    me.worn.push(detachItem(chars, it.id, me.worn) || entryFromItem(it));
                    done.push(`+${it.name}`);
                }
                continue;
            }
            const f = locate(ref);
            if (f && f.listName === 'off') {
                f.owner.off.splice(f.i, 1);
                me.worn.push(f.e);
                done.push(`+${f.e.name}`);
            } else if (f && f.listName === 'worn' && f.owner !== me) {
                // взял чужую надетую вещь
                f.owner.worn.splice(f.i, 1);
                me.worn.push(f.e);
                done.push(`+${f.e.name}`);
            }
        }
        const removedSlots = new Set();
        for (const id of [...asArr(ch.remove), ...asArr(ch.discard)]) {
            const r = byId(id);
            if (r?.kind === 'entry' && r.who === who) {
                const e = [...me.worn, ...me.off].find(x => x.uid === r.uid);
                if (e) removedSlots.add(normSlot(e.slot));
            }
        }
        for (const a of asArr(ch.add)) {
            const name = String(typeof a === 'string' ? a : a?.name || '').trim();
            if (!name) continue;
            const want = { name, slot: normSlot(typeof a === 'object' ? a.slot : 'other') };
            const best = (list) => {
                let top = null, score = 0;
                for (const e of list) { const sc = matchScore(want, e, ownerWords); if (sc > score) { top = e; score = sc; } }
                return score >= SAME ? top : null;
            };
            // уже надето (та же вещь другими словами) — ничего не делаем
            if (best(me.worn)) continue;
            // причёска/макияж: одна на персонажа; без явной смены (remove) это та же самая
            if (SINGLE.includes(want.slot) && me.worn.some(e => normSlot(e.slot) === want.slot) && !removedSlots.has(want.slot)) continue;
            // лежит рядом у себя
            let e = best(me.off);
            if (e) { me.off.splice(me.off.indexOf(e), 1); me.worn.push(e); done.push(`+${e.name}`); continue; }
            // у другого персонажа — переходит (передал, взял, накинул чужое)
            let moved = null;
            for (const [other, st] of Object.entries(chars)) {
                if (other === who || !st) continue;
                for (const list of ['worn', 'off']) {
                    e = best(st[list] || []);
                    if (e && canTake({ list, entry: e, wantName: name, from: other, to: who, closet, aliases })) {
                        st[list].splice(st[list].indexOf(e), 1);
                        moved = { e, from: other };
                        break;
                    }
                }
                if (moved) break;
            }
            if (moved) { me.worn.push(moved.e); done.push(`+${moved.e.name} (от ${moved.from})`); continue; }
            // есть в шкафу — надеваем вещь из шкафа
            const it = best(closet || []);
            const holder = it ? Object.entries(chars).find(([n, st]) => n !== who && (st?.worn || []).some(x => x.itemId === it.id)) : null;
            if (it && !holder) { me.worn.push(detachItem(chars, it.id, me.worn) || entryFromItem(it)); done.push(`+${it.name}`); continue; }
            me.worn.push(newEntry(want));
            done.push(`+${name}`);
        }
        for (const s of asArr(ch.state)) {
            const f = locate(byId(s?.id));
            if (f) {
                f.e.state = String(s.state || '').trim();
                done.push(f.e.state ? `${f.e.name}: ${f.e.state}` : `${f.e.name}: как было`);
            }
        }
        if (done.length) notes.push(`${who}: ${ch.note ? String(ch.note).trim() : done.join(', ')}`);
    }
    return notes;
}

export const ANALYZE_SYSTEM = `Ты — стилист-костюмер. По описанию и/или фото разложи образ на отдельные вещи гардероба.
Для каждой вещи:
- name — короткое название по-русски, как сказал бы человек, 2–6 слов: цвет, материал, фасон («чёрное шерстяное пальто до колена»);
- slot — одно из: outer (верхняя одежда), dress (платье/комбинезон), top (верх), bottom (низ), under (бельё), legwear (носки/колготки/чулки), shoes (обувь), head (головной убор), acc (аксессуары, украшения, сумки, очки, ремни), hair (причёска — без цвета волос, только форма, длина, укладка, заколки), makeup (макияж целиком одной вещью: глаза, губы, кожа), other;
- desc — 1–2 предложения по-русски: ткань, цвет, фасон, посадка, длина, детали (пуговицы, принт, вырез).
Если в описании или на фото есть причёска и макияж — добавь их отдельными вещами (hair, makeup). Не описывай лицо, тело, позу, фон. Только JSON без пояснений:
{"items":[{"name":"","slot":"","desc":""}]}`;

export function parseAnalyzed(text) {
    const j = extractJson(text);
    const list = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
    return list
        .filter(x => x && String(x.name || '').trim())
        .map(x => ({ name: cut(x.name, 80), slot: normSlot(x.slot), desc: String(x.desc || '').trim() }));
}

// ───── образы (полные комплекты): разделы, импорт с фото или промта, версии картинок ─────

/** Разделы коллекции образов. Три её — «Офис», «Вечернее», «Спортивное» — видны у каждого персонажа даже пустыми. */
export const DEFAULT_CATS = ['Повседневное', 'Офис', 'Вечернее', 'Спортивное', 'Дом и сон', 'Бельё', 'Миссия'];
export const CORE_CATS = ['Офис', 'Вечернее', 'Спортивное'];
const CAT_HINTS = {
    'повседневное': 'на каждый день: джинсы, футболки, свитеры, худи, кроссовки, куртки',
    'офис': 'деловое и рабочее: костюмы, блейзеры, рубашки, брюки, юбки-карандаш, лабораторное',
    'вечернее': 'выход, ужин, свидание, вечеринка, приём: платья, смокинги, каблуки',
    'спортивное': 'спорт, бег, зал, йога: спортивные костюмы, леггинсы, топы, спортивные кроссовки',
    'дом и сон': 'дома и в постели: пижамы, халаты, домашнее, лаунж',
    'белье': 'бельё, купальники, корсеты',
    'миссия': 'задание, бой, слежка: тактическое, форма, бронежилет, экипировка, костюм героя',
};

/** Чистый список разделов: без пустых и повторов. */
export function catList(cats) {
    const out = [];
    for (const c of Array.isArray(cats) ? cats : String(cats || '').split(/[\n,;]+/)) {
        const t = String(c || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        if (t && !out.some(x => norm(x) === norm(t))) out.push(t);
    }
    return out;
}

/** «вечерний» → «Вечернее», «sport» → «Спортивное»: раздел из ответа модели → раздел из списка (или ''). */
export function matchCat(c, cats) {
    const n = norm(c).replace(/[«»"'.!]/g, '').trim();
    if (!n) return '';
    const list = catList(cats);
    const root = (w) => norm(w).replace(/[«»"'.!]/g, '').split(/\s+/)[0].slice(0, 5);
    return list.find(x => norm(x) === n)
        || list.find(x => norm(x).startsWith(n) || n.startsWith(norm(x)))
        || list.find(x => root(x).length >= 4 && root(n).startsWith(root(x).slice(0, 4)))
        || [
            [/sport|gym|athlet|fitness|yoga|спорт|фитнес/, /спорт/i],
            [/office|work|business|formal|делов|офис|работ/, /офис/i],
            [/evening|party|gala|cocktail|date|вечер|выход|праздн/, /вечер/i],
            [/home|sleep|pajama|pyjama|lounge|night|дом|пижам|сон/, /дом|сон|пижам/i],
            [/linger|underw|swim|бель|купальн/, /бель/i],
            [/mission|combat|tactic|uniform|battle|мисси|бо[ей]|тактич|форм/, /мисси|бо[ей]/i],
            [/casual|everyday|street|daily|повсед|кэжуал|каждый/, /повсед/i],
        ].map(([re, want]) => (re.test(n) ? list.find(x => want.test(x)) : '')).find(Boolean)
        || '';
}

const catsLine = (cats) => catList(cats).map(c => { const h = CAT_HINTS[norm(c)]; return h ? `«${c}» — ${h}` : `«${c}»`; }).join('; ');

/** Системный промт разбора образа: фото и/или готовый промт → название, раздел, промт образа, вещи. */
export function lookSystem(cats, withLook = false) {
    return `Ты — стилист-костюмер. Тебе дают фото готового образа и/или готовый промт картинки с образом. Разбери образ: одежду, обувь, сумки, украшения${withLook ? ', причёску и макияж' : ''}.
Верни только JSON без пояснений:
{"name":"","cat":"","prompt":"","items":[{"name":"","slot":"","desc":""}]}
- name — название образа по-русски, 2–5 слов, по главной вещи или настроению («Чёрное платье на халтере», «Кремовый блейзер и оливковый шёлк»).
- cat — ровно один раздел из списка (пиши как в списке): ${catsLine(cats)}.
- prompt — промт образа ПО-АНГЛИЙСКИ для генератора картинок, 40–90 слов: только одежда, обувь, сумка, украшения${withLook ? ', причёска (без цвета волос) и макияж' : ''} — цвета, ткани, фасон, посадка, длина, детали. Без лица, внешности, телосложения, позы, фона, света, камеры и стиля рисования.
- items — каждая отдельная вещь:
  name — короткое название по-русски, 2–6 слов: цвет, материал, фасон («чёрное шерстяное пальто до колена»);
  slot — одно из: outer (верхняя одежда), dress (платье/комбинезон), top (верх), bottom (низ), under (бельё), legwear (носки/колготки/чулки), shoes (обувь), head (головной убор), acc (аксессуары, украшения, сумки, очки, ремни)${withLook ? ', hair (причёска — только форма, длина, укладка, заколки, без цвета волос), makeup (макияж целиком одной вещью)' : ''}, other;
  desc — 1–2 предложения по-русски: ткань, цвет, фасон, посадка, длина, детали (пуговицы, принт, вырез).
- Если дан промт — бери из него только образ; стиль рисования, фон, свет, внешность, позу и камеру выбрось.
- Если на фото чего-то не видно (обувь за кадром) — не выдумывай.
- ${withLook ? 'Причёску и макияж добавь отдельными вещами, если они видны или описаны.' : 'Причёску и макияж НЕ добавляй и в prompt не пиши: образ наденут на другого человека, у него свои волосы и лицо.'}`;
}

/** Ответ модели на разбор образа → { name, cat, prompt, items }. */
export function parseLook(text, cats, withLook = false) {
    const j = extractJson(text) || {};
    const raw = Array.isArray(j.items) ? j.items : [];
    const items = raw
        .filter(x => x && String(x.name || '').trim())
        .map(x => ({ name: cut(x.name, 80), slot: normSlot(x.slot), desc: String(x.desc || '').trim() }))
        .filter(x => withLook || !isLook(x.slot));
    return {
        name: cut(String(j.name || '').replace(/^["«]|["»]$/g, ''), 60),
        cat: matchCat(j.cat, cats),
        prompt: String(j.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
        items,
    };
}

/** Разложить уже сохранённые образы по разделам: короткие id → раздел. */
export function catSystem(cats) {
    return `Ты — стилист. Распредели образы гардероба по разделам. Разделы (пиши как в списке): ${catsLine(cats)}.
Для каждого образа по названию и вещам выбери ровно один раздел. Ответ — только JSON без пояснений: {"cats":{"l1":"Офис","l2":"Вечернее"}}`;
}

/** «Bucky Barnes 2014» → «bucky barnes»: один человек в разных эпохах («Священный таймлайн»). */
export const baseName = (n) => norm(n).replace(/\s+(1[89]|20)\d\d$/, '').trim();

/**
 * Чей образ по названию: первое слово названия — имя или прозвище персонажа («Хеди, осень» → Хеди, «Баки — тактика» → Баки).
 * Только первое слово: «Для свидания с Баки» — не про владельца. Несколько разных людей подходят — ''.
 * prefer — кого брать, если подходят карточки одного человека из разных эпох (сначала сцена, потом у кого больше вещей).
 */
export function ownerFromTitle(title, candidates, aliases = {}, prefer = []) {
    const tok = norm(title).replace(/[^\p{L}\p{N}\s-]+/gu, ' ').trim().split(/[\s-]+/)[0] || '';
    if (tok.length < 3 || !/\p{L}/u.test(tok)) return '';
    const hit = (w) => w.length >= 3 && /\p{L}/u.test(w)
        && (w === tok || (w.length >= 4 && tok.length <= w.length + 3 && tok.startsWith(w.slice(0, Math.max(4, w.length - 1)))));
    const hits = [...new Set(candidates.filter(Boolean))].filter(n => [...charWords(n, aliases)].some(hit));
    if (!hits.length || new Set(hits.map(baseName)).size > 1) return '';
    return prefer.find(n => hits.includes(n)) || hits[0];
}

/** Подсказки, чей образ: по названию и по владельцам его вещей (если все вещи одного человека). */
export function guessLookOwner(set, items, candidates, aliases = {}, prefer = []) {
    const byTitle = ownerFromTitle(set?.name, candidates, aliases, prefer);
    const owners = [...new Set((set?.itemIds || []).map(id => items.find(i => i.id === id)?.owner).filter(Boolean))];
    return { byTitle, byItems: owners.length === 1 ? owners[0] : '', owners };
}

/**
 * Навести порядок с владельцами образов (меняет sets на месте, возвращает [{ set, from, to }]):
 * - у «общего» образа владелец — по названию, иначе по вещам;
 * - образ с владельцем, но в названии другой человек («Хеди — дома» у Баки), а вещи не владельца — переложить.
 * Совсем непонятные остаются общими.
 */
export function fixLookOwners(sets, items, candidates, aliases = {}, prefer = []) {
    const moved = [];
    for (const set of sets || []) {
        if (!set || set.pending) continue;
        const g = guessLookOwner(set, items || [], candidates, aliases, prefer);
        if (!set.owner) {
            const to = g.byTitle || g.byItems;
            if (to) { moved.push({ set, from: '', to }); set.owner = to; }
        } else if (g.byTitle && baseName(g.byTitle) !== baseName(set.owner)
            && (g.byItems === g.byTitle || !g.owners.some(o => baseName(o) === baseName(set.owner)))) {
            moved.push({ set, from: set.owner, to: g.byTitle });
            set.owner = g.byTitle;
        }
    }
    return moved;
}

/** Образ надет целиком (все его вещи на персонаже)? */
export function wornAll(st, set) {
    const ids = set?.itemIds || [];
    return !!ids.length && ids.every(id => (st?.worn || []).some(e => e.itemId === id));
}

// версии картинок: новая картинка встаёт поверх, прежние остаются и листаются
export const GALLERY_MAX = 12;

/** Все версии картинки вещи/образа: imgs + текущая img (если её туда не положили — например, Life). */
export function galleryOf(o) {
    const out = [];
    for (const u of [...(Array.isArray(o?.imgs) ? o.imgs : []), o?.img]) if (u && !out.includes(u)) out.push(u);
    return out;
}

/** Новая версия: в конец списка и сразу текущей. */
export function pushImg(o, path, max = GALLERY_MAX) {
    if (!o || !path) return o;
    const g = galleryOf(o).filter(u => u !== path);
    g.push(path);
    o.imgs = g.slice(-max);
    o.img = path;
    return o;
}

/** Листнуть версию: dir = 1 / -1 (по кругу). Возвращает новую текущую. */
export function stepImg(o, dir) {
    const g = galleryOf(o);
    if (g.length < 2) return o?.img || '';
    let i = g.indexOf(o.img);
    if (i < 0) i = g.length - 1;
    o.imgs = g;
    o.img = g[(i + (dir < 0 ? -1 : 1) + g.length) % g.length];
    return o.img;
}

/** Убрать текущую версию: текущей станет предыдущая (или ничего). */
export function dropImg(o) {
    const g = galleryOf(o);
    const i = g.indexOf(o?.img);
    const rest = g.filter(u => u !== o?.img);
    if (!o) return '';
    o.imgs = rest;
    o.img = rest.length ? rest[Math.max(0, Math.min(rest.length - 1, i - 1))] : '';
    return o.img;
}

/** «Bucky Barnes = Баки, Барнс» → { 'Bucky Barnes': ['баки','барнс'] } */
export function parseAliases(text) {
    const map = {};
    for (const line of String(text || '').split('\n')) {
        const l = line.trim();
        if (!l || l.startsWith('#') || !l.includes('=')) continue;
        const i = l.indexOf('=');
        const n = l.slice(0, i).trim();
        if (n) map[n] = l.slice(i + 1).split(',').map(x => norm(x)).filter(Boolean);
    }
    return map;
}

/**
 * Склеить дубли во всём чате: одна вещь шкафа — один экземпляр; «новое» без шкафа, похожее на известную вещь,
 * заменяется этой вещью (остаётся там, где лежал дубль — это последнее состояние). Возвращает число склеек.
 */
export function dedupeChars(chars, closet = [], cast = [], aliases = {}) {
    const ownerWords = ownerWordsOf([...cast, ...Object.keys(chars || {})], aliases);
    let n = 0;
    const all = () => {
        const out = [];
        for (const [who, st] of Object.entries(chars || {})) for (const list of ['worn', 'off']) for (const e of st?.[list] || []) out.push({ who, st, list, e });
        return out;
    };
    // 1) одна вещь шкафа в нескольких местах — оставляем надетую
    const byItem = new Map();
    for (const x of all()) {
        if (!x.e.itemId) continue;
        const prev = byItem.get(x.e.itemId);
        if (!prev) { byItem.set(x.e.itemId, x); continue; }
        const drop = prev.list === 'worn' && x.list !== 'worn' ? x : prev;
        drop.st[drop.list].splice(drop.st[drop.list].indexOf(drop.e), 1);
        if (drop === prev) byItem.set(x.e.itemId, x);
        n++;
    }
    // 2) «новое» (без шкафа), похожее на известную вещь или вещь шкафа
    for (const x of all()) {
        if (x.e.itemId) continue;
        let match = null, score = 0;
        for (const y of all()) {
            if (y.e === x.e) continue;
            if (y.who !== x.who && !canTake({ list: y.list, entry: y.e, wantName: x.e.name, from: y.who, to: x.who, closet, aliases })) continue;
            const sc = matchScore(x.e, y.e, ownerWords);
            if (sc > score && (y.e.itemId || y.e.img)) { match = y; score = sc; }
        }
        if (score >= SAME && match) {
            match.st[match.list].splice(match.st[match.list].indexOf(match.e), 1);
            x.st[x.list][x.st[x.list].indexOf(x.e)] = { ...match.e, state: x.e.state || match.e.state };
            n++;
            continue;
        }
        let it = null; score = 0;
        for (const c of closet || []) { const sc = matchScore(x.e, c, ownerWords); if (sc > score) { it = c; score = sc; } }
        if (score >= SAME && it && !all().some(y => y.e.itemId === it.id)) {
            x.st[x.list][x.st[x.list].indexOf(x.e)] = { ...entryFromItem(it), state: x.e.state || '' };
            n++;
        }
    }
    // 3) две причёски / два макияжа надето сразу — оставляем известный (из шкафа), «новые» описания того же убираем
    for (const st of Object.values(chars || {})) {
        if (!st) continue;
        for (const k of SINGLE) {
            const worn = (st.worn || []).filter(e => normSlot(e.slot) === k);
            if (worn.length < 2) continue;
            const known = worn.filter(e => e.itemId);
            const keep = known.length ? known[known.length - 1] : worn[worn.length - 1];
            for (const e of worn) {
                if (e === keep) continue;
                st.worn.splice(st.worn.indexOf(e), 1);
                if (e.itemId) st.off.push(e);
                n++;
            }
        }
    }
    // 4) два одинаковых «новых» у одного персонажа — оставляем надетый
    for (const st of Object.values(chars || {})) {
        if (!st) continue;
        for (const list of ['worn', 'off']) {
            const arr = st[list] || [];
            for (let i = arr.length - 1; i >= 0; i--) {
                const e = arr[i];
                if (e.itemId) continue;
                const twin = [...st.worn, ...st.off].find(o => o !== e && matchScore(e, o, ownerWords) >= SAME);
                if (twin && !(list === 'worn' && st.off.includes(twin))) { arr.splice(i, 1); n++; }
            }
        }
    }
    return n;
}
