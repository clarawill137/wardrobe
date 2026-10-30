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
- wear — id вещей, которые снова надели: из off этого персонажа или из шкафа (closet).
- add — новые вещи, которых нет ни в worn, ни в off, ни в шкафу: {"name": "короткое название по-русски: цвет, материал, фасон", "slot": одно из [outer, dress, top, bottom, under, legwear, shoes, head, acc, hair, makeup, other]}. Чужая вещь — добавь владельца в название: «худи Баки».
- Причёска (slot hair) и макияж (slot makeup) — тоже «вещи»: распустила хвост, заплела косу → remove старую причёску + add новую; смыла макияж → remove; размазалась тушь, растрепались волосы → state.
- state — пометка на надетой вещи: {"id": "...", "state": "расстёгнута"}; пустая строка снимает пометку.
- discard — id вещей, которые испорчены, выброшены или остались где-то насовсем.
- «Разделся догола» = remove всех его worn, КРОМЕ закреплённых (pinned), причёски (hair) и макияжа (makeup).
- pinned: true — постоянные вещи (обручальное кольцо, пирсинг, жетоны): снимай их, только если в тексте прямо сказано, что сняли именно эту вещь. Переоделся в другое = remove старого + add/wear нового.
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
                    const old = me.off.findIndex(e => e.itemId === it.id);
                    if (old >= 0) me.off.splice(old, 1);
                    me.worn.push(entryFromItem(it));
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
        for (const a of asArr(ch.add)) {
            const name = typeof a === 'string' ? a : a?.name;
            if (!String(name || '').trim()) continue;
            if (me.worn.some(e => norm(e.name) === norm(name))) continue;
            const fromOff = me.off.findIndex(e => norm(e.name) === norm(name));
            if (fromOff >= 0) { me.worn.push(me.off.splice(fromOff, 1)[0]); done.push(`+${name}`); continue; }
            me.worn.push(newEntry({ name, slot: typeof a === 'object' ? a.slot : 'other' }));
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
