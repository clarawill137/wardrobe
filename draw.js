// 👗 Гардероб — картинки вещей и комплектов.
// Рисует через провайдеров картинок напрямую из браузера (как sillyimages):
// Atlas Cloud (наш патч SLAY), Naistera, OpenRouter (Nano Banana и др.), Gemini, xAI (Grok), OpenAI-совместимые.
// Подключение берётся из профилей sillyimages или из своих полей в настройках гардероба.

// «Масло, полуреализм» (1.8, по её референсам): живопись маслом, полуреализм, тот же человек дважды на светлом фоне —
// слева в полный рост анфас, справа крупнее, в три четверти от колен. Портрет 2:3.
// Сверено с её референсами (22.11: белая и коричневая шубы): реалистичная живопись маслом — живое лицо настоящего человека,
// мазки видны в волосах, мехе и ткани, мягкие края без контуров; гладкий светло-серый студийный фон. Прежний текст
// («fashion illustration», «canvas texture») рисовал плоскую иллюстрацию с обводкой и текстурой холста.
const OIL = 'Realistic oil painting, a contemporary fashion portrait painted digitally: true-to-life anatomy and proportions, the realistic face of a real person with natural skin, natural eye size and softly painted features, a calm model expression; loose confident brushstrokes visible in the hair, fur and fabric, glossy painted highlights on leather, satin and jewellery, soft edges everywhere, smooth blended skin, rich true-to-life colour.';
const OIL_TWO = 'The same person appears twice on one tall canvas: on the left a full-length figure standing in a relaxed fashion pose, head to shoes fully in frame, with a soft shadow on the floor; on the right the same person larger and closer in a three-quarter view from mid-thigh up, cropped by the right and bottom edges of the canvas and slightly overlapping the left figure, calm gaze toward the viewer.';
const OIL_BG = 'Smooth plain light grey seamless studio backdrop with a faint gradient, soft diffused daylight, gentle natural shadows; only the figures on the empty backdrop.';

export const STYLES = {
    oil: {
        t: 'Масло, полуреализм — два ракурса',
        short: 'Масло',
        d: 'реалистичная живопись маслом: живое лицо, мазки на волосах, мехе и ткани; в полный рост и крупнее до бёдер, светло-серый фон',
        person: true,
        aspect: '2:3',
        // реф лица бывает рисованным — от него берётся только кто это, а пишется лицо этим маслом
        refNote: 'Take only the identity from the reference image; whatever style it is in, paint this person realistically in the oil manner described above.',
        p: `${OIL} One person wearing this item, with simple plain neutral basics for the rest of the outfit. ${OIL_TWO} ${OIL_BG}`,
        set: `${OIL} One person wearing this complete outfit. ${OIL_TWO} ${OIL_BG}`,
        look: `${OIL} One person shown twice to showcase the {kind} clearly: on the left a three-quarter view, on the right a larger head-and-shoulders close-up from the front, calm gaze at the viewer. ${OIL_BG}`,
        detail: `${OIL} Two views on one canvas: on the left a large, detailed close-up of {focus}; on the right {right}, dressed in simple plain neutral basics so this piece stands out as the hero. ${OIL_BG}`,
    },
    clover: {
        t: 'Карандаш, лукбук на человеке (как было)',
        short: 'Карандаш',
        d: 'цветной карандаш, полный рост + крупно, чёрный фон с дудлами',
        person: true,
        aspect: '4:3',
        p: 'Fashion lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading and crisp linework: one person wearing this item (with simple neutral basics for the rest), shown twice — a full-body standing pose on the left and a cheerful waist-up close-up on the right. Solid black background with a faint white grid on the left half, playful hand-drawn white doodles around (little stars, hearts, sparkles, exclamation marks). Warm natural skin, expressive but natural face. No text, no logo.',
        set: 'Fashion lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading and crisp linework: one person wearing this complete outfit, shown twice — a full-body standing pose on the left and a cheerful waist-up close-up on the right. Solid black background with a faint white grid on the left half, playful hand-drawn white doodles around (little stars, hearts, sparkles, exclamation marks). Warm natural skin, expressive but natural face. No text, no logo.',
        look: 'Beauty lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading: one person shown twice — a head-and-shoulders close-up from the front on the right and a three-quarter view on the left, to showcase the {kind} clearly. Solid black background, playful hand-drawn white doodles (stars, sparkles, hearts). No text, no logo.',
    },
    sketch: {
        t: 'Скетч модельера (акварель)',
        short: 'Акварель',
        d: 'акварель и тушь, вещь отдельно, без человека',
        p: 'Fashion design illustration: watercolor and fine ink sketch of a single garment on clean off-white paper, elegant loose brushwork, soft natural shadow, the item drawn alone, no model, no person, no mannequin, no hands, no text, no logo.',
        set: 'Fashion design illustration: watercolor and fine ink sketch on clean off-white paper, elegant loose brushwork, soft natural shadow, no model, no person, no mannequin, no hands, no text, no logo.',
        look: 'Beauty fashion illustration: watercolor and fine ink sketch of a head-and-shoulders portrait on clean off-white paper, elegant loose brushwork, focused on showing the {kind}. No text, no logo.',
    },
    photo: {
        t: 'Фото из каталога',
        short: 'Каталог',
        d: 'фото вещи на сером фоне, без человека',
        p: 'E-commerce catalog product photo of a single garment, ghost mannequin or neat flat lay, plain light-grey seamless background, soft diffused studio light, high detail fabric texture, no person, no text, no logo.',
        set: 'Editorial flat-lay product photo, plain light-grey seamless background, soft diffused studio light, high detail fabric texture, no person, no text, no logo.',
        look: 'Beauty editorial photo, head-and-shoulders portrait on a plain light-grey background, soft diffused studio light, focused on showing the {kind}. No text, no logo.',
    },
    anime: {
        t: 'Аниме-иллюстрация',
        short: 'Аниме',
        d: 'чистый лайн, пастель, без человека',
        p: 'Anime style item illustration of a single garment, clean lineart, soft cel shading, pastel palette, plain white background, no person, no text.',
        set: 'Anime style illustration, clean lineart, soft cel shading, pastel palette, plain white background, no person, no text.',
        look: 'Anime style head-and-shoulders portrait, clean lineart, soft cel shading, pastel palette, plain white background, focused on showing the {kind}. No text.',
    },
    pixel: {
        t: 'Иконка (как в игре)',
        short: 'Иконки',
        d: 'милая 3D-иконка вещи',
        p: 'Cute game inventory icon of a single clothing item, soft 3D render, rounded shapes, gentle pastel lighting, centered on a plain soft background, no person, no text.',
        set: 'Cute game inventory illustration, soft 3D render, rounded shapes, gentle pastel lighting, plain soft background, no person, no text.',
        look: 'Cute stylized 3D character bust, soft render, gentle pastel lighting, plain soft background, focused on showing the {kind}. No text.',
    },
};

const LOOK_KIND = { hair: 'hairstyle', makeup: 'makeup' };

/** Мелкие вещи в «лукбуке» — крупный план, а не человек в рандомном образе. */
const DETAIL = {
    acc: { focus: 'the accessory exactly where it is worn (on the fingers, wrist, neck, ears, shoulder or waist — wherever it belongs)', right: 'a cheerful waist-up portrait of the person wearing it' },
    head: { focus: 'the headwear on the head, from a slight three-quarter angle', right: 'a cheerful head-and-shoulders portrait of the person wearing it' },
    shoes: { focus: 'the feet and ankles wearing the shoes, from a low side angle', right: 'a full-body standing pose of the person wearing them' },
    legwear: { focus: 'the legs wearing the hosiery or socks', right: 'a full-body standing pose of the person wearing them' },
};
STYLES.clover.detail = 'Fashion lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading and crisp linework, two panels side by side: on the left a large, detailed close-up of {focus}; on the right {right}, dressed in simple plain neutral basics so this piece stands out as the hero. Solid black background with a faint white grid behind the close-up, playful hand-drawn white doodles around (little stars, hearts, sparkles, exclamation marks). Warm natural skin, expressive but natural face. No text, no logo.';
const PERSON_REF_RULE = 'The attached reference image shows the exact person: keep their face, features, skin tone and body type exactly as in the reference.';

/** Короткое имя стиля для чипа: «Масло», «Карандаш»… */
export function styleShort(s) {
    if (s?.imgStyle === 'custom') return 'Свой';
    return STYLES[s?.imgStyle]?.short || 'Акварель';
}

/** Соотношение сторон картинки: у масла портрет 2:3, у карандашного лукбука 4:3, у вещей без человека квадрат. */
export function styleAspect(s, slot = '') {
    return STYLES[s?.imgStyle]?.aspect || (styleHasPerson(s, slot) ? '4:3' : '1:1');
}

const styleDetail = (s, slot) => (DETAIL[slot] && STYLES[s?.imgStyle]?.detail) || '';

export const DEFAULT_MODELS = {
    openrouter: 'google/gemini-3.1-flash-image',
    gemini: 'gemini-3.1-flash-image-preview',
    xai: 'grok-imagine-image-2.0',
    openai: 'gpt-image-1',
    naistera: 'nano banana',
    atlas: 'google/nano-banana-pro/edit-developer',
};

/**
 * Atlas Cloud — все рисовалки патч-SLAY (её «добавь все из слей», 22.11; схемы запросов — как в SLAY_ATLAS_MORE_V1).
 * max > 0 — модель берёт рефы (лицо + фото вещи) и держит лицо; без рефов edit-модель сама переходит на свою t2i-версию.
 * max 0 — рисует только по тексту: лицо по рефу не держит. kind — как собирать запрос; loose — схема у Atlas описана не
 * до конца (на отказ — без base64 / другие имена размеров); compose — модель по умолчанию правит первую картинку, просим новую.
 */
export const ATLAS_EDIT = {
    'google/nano-banana-pro/edit-developer': { field: 'images', t2i: 'google/nano-banana-pro/text-to-image', kind: 'banana', max: 5, t: 'Nano Banana Pro Edit dev (дешевле)' },
    'google/nano-banana-pro/edit': { field: 'images', t2i: 'google/nano-banana-pro/text-to-image', kind: 'banana', max: 5, t: 'Nano Banana Pro Edit' },
    'xai/grok-imagine-image-quality/edit': { field: 'image_urls', t2i: 'xai/grok-imagine-image-quality/text-to-image', kind: 'grok', max: 5, t: 'Grok Image Edit' },
    'openai/gpt-image-2/edit': { field: 'images', t2i: 'openai/gpt-image-2/text-to-image', kind: 'gpt', max: 5, t: 'GPT Image 2 Edit' },
    'bytedance/seedream-v5.0-pro/edit': { field: 'images', t2i: 'bytedance/seedream-v5.0-pro/text-to-image', kind: 'seedream', max: 10, t: 'Seedream 5.0 Pro Edit' },
    'bytedance/seedream-v5.5/edit': { field: 'reference_images', t2i: 'bytedance/seedream-v5.5/text-to-image', kind: 'seedream55', max: 10, t: 'Seedream 5.5 Edit (дёшево)' },
    'black-forest-labs/flux-3/edit': { field: 'reference_images', t2i: 'black-forest-labs/flux-3/text-to-image', kind: 'flux3', max: 10, loose: true, t: 'FLUX 3 Edit (мягкий фильтр)' },
    'openai/gpt-image-2.5-sunburst-developer/edit': { field: 'images', t2i: 'openai/gpt-image-2.5-sunburst-developer/text-to-image', kind: 'gpt', max: 10, loose: true, t: 'GPT Image 2.5 Sunburst Edit' },
    'microsoft/mai-image-2.6/edit': { field: 'reference_images', t2i: 'microsoft/mai-image-2.6/text-to-image', kind: 'mai', max: 5, loose: true, compose: true, t: 'MAI-Image 2.6 Edit (фотореализм)' },
    'qwen-image-3.0-pro/edit': { field: 'reference_image_urls', t2i: 'qwen-image-3.0-pro/text-to-image', kind: 'qwen', max: 3, loose: true, compose: true, t: 'Qwen Image 3.0 Pro Edit (бета)' },
    'alibaba/wan-2.7-pro/image-edit': { field: 'images', t2i: 'alibaba/wan-2.7-pro/text-to-image', kind: 'wan', max: 9, loose: true, compose: true, t: 'Wan 2.7 Pro Edit' },
    'xai/grok-imagine-image-2.0/edit': { field: 'image_urls', t2i: 'xai/grok-imagine-image-2.0/text-to-image', kind: 'grok2', max: 3, loose: true, compose: true, t: 'Grok Imagine 2.0 Edit' },
    'midjourney/v8.2/image-to-image': { field: 'image', single: true, url: true, t2i: 'midjourney/v8.2/text-to-image', kind: 'mj', max: 1, t: 'Midjourney V8.2 (1 реф как образец)' },
    'black-forest-labs/flux-kontext-dev': { field: 'image', t2i: 'black-forest-labs/flux-dev', kind: 'kontext', max: 1, t: 'Flux Kontext Dev (1 реф)' },
    'black-forest-labs/flux-kontext-dev-lora': { field: 'image', t2i: 'black-forest-labs/flux-dev-lora', kind: 'kontext', max: 1, lora: true, t: 'Flux Kontext Dev LoRA (1 реф, LoRA из SLAY)' },
    // только по тексту — лицо по рефу не держат
    'black-forest-labs/flux-dev': { kind: 'fluxdev', max: 0, t: 'Flux Dev (без рефов)' },
    'black-forest-labs/flux-dev-lora': { kind: 'fluxdev', max: 0, lora: true, t: 'Flux Dev LoRA (без рефов, LoRA из SLAY)' },
    'xai/grok-imagine-image-quality/text-to-image': { kind: 'grok', max: 0, t: 'Grok Image (без рефов)' },
    'midjourney/v8.2/text-to-image': { kind: 'mj', max: 0, t: 'Midjourney V8.2 (без рефов)' },
    'krea-2-turbo/text-to-image': { kind: 'krea', max: 0, loose: true, t: 'Krea 2 Turbo (без рефов)' },
};
/** Модель Atlas держит лицо (берёт рефы). */
export const atlasTakesRefs = (model) => (ATLAS_EDIT[model]?.max || 0) > 0;

// ── как SLAY собирает запросы Atlas (SLAY_ATLAS_MORE_V1, SLAY_GROK_AR_V1) ──
const ATLAS_ASPECTS = {
    grok: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1', '21:9', '5:2'],
    grok2: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1'],
    mj: ['1:1', '9:16', '16:9', '4:3', '3:4', '2:3', '3:2', '9:21', '21:9'],
    flux3: ['21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2'],
};
const SEEDREAM_SIZES = ['2048*2048', '2368*1776', '1776*2368', '2816*1584', '1584*2816', '2496*1664', '1664*2496', '3136*1344',
    '1024*1024', '1536*1536', '1776*1328', '1328*1776', '2048*1152', '1152*2048'];
const SEEDREAM55_SIZES = ['2048*2048', '2368*1776', '1776*2368', '2816*1584', '1584*2816', '2496*1664', '1664*2496', '3136*1344',
    '1536*1536', '1792*1344', '1344*1792', '2048*1152', '1152*2048', '1872*1248', '1248*1872', '2352*1008', '1024*1024', '1152*864',
    '864*1152', '1424*800', '800*1424', '1248*832', '832*1248', '1568*672'];
const COMPOSE_NOTE = 'Make a NEW picture from the description below: the attached images give only the person\'s face and the clothes; pose, framing, light and background come from the description.';
const ratioOf = (x, sep = ':') => { const [w, h] = String(x || '').split(sep).map(Number); return w > 0 && h > 0 ? w / h : NaN; };
function snapAspect(ar, kind) {
    const list = ATLAS_ASPECTS[kind];
    if (!list || list.includes(ar)) return ar;
    const want = ratioOf(ar);
    if (!Number.isFinite(want)) return '2:3';
    let best = list[0], d = Infinity;
    for (const c of list) { const x = Math.abs(Math.log(ratioOf(c) / want)); if (x < d) { d = x; best = c; } }
    return best;
}
function seedreamSize(ar, list, biggest = false) {
    let want = ratioOf(ar);
    if (!Number.isFinite(want)) want = 2 / 3;
    const dist = (sz) => Math.abs(Math.log(ratioOf(sz, '*') / want));
    const px = (sz) => sz.split('*').reduce((a, b) => a * Number(b), 1);
    const best = Math.min(...list.map(dist));
    const same = list.filter(sz => dist(sz) - best < 0.01);
    const cheap = same.filter(sz => px(sz) <= 2.61e6).sort((a, b) => px(b) - px(a));
    return biggest ? same.sort((a, b) => px(b) - px(a))[0] : (cheap[0] || same.sort((a, b) => px(a) - px(b))[0]);
}
function qwenSize(ar, max) {
    let r = ratioOf(ar);
    if (!Number.isFinite(r)) r = 2 / 3;
    const f = (x) => Math.max(512, Math.min(max, Math.round(x / 16) * 16));
    return r >= 1 ? `${f(max)}*${f(max / r)}` : `${f(max * r)}*${f(max)}`;
}
function kreaSize(ar, alt) {
    let want = ratioOf(ar);
    if (!Number.isFinite(want)) want = 2 / 3;
    const opts = [['square_hd', 1], [alt ? 'portrait_4_3' : 'portrait_3_4', 3 / 4], [alt ? 'portrait_16_9' : 'portrait_9_16', 9 / 16], ['landscape_4_3', 4 / 3], ['landscape_16_9', 16 / 9]];
    let pick = opts[0][0], d = Infinity;
    for (const [name, r] of opts) { const x = Math.abs(Math.log(r / want)); if (x < d) { d = x; pick = name; } }
    return pick;
}
const frameHint = (ar) => { const r = ratioOf(ar); return `Frame: ${!Number.isFinite(r) || r < 0.95 ? 'vertical (portrait)' : r > 1.05 ? 'horizontal (landscape)' : 'square'}, aspect ratio ${ar}.`; };
/** Midjourney: не длиннее 1000 знаков и сначала — что за образ: строки про рефы ей ни о чём, стиль — после. */
function mjPrompt(p, max = 1000) {
    const lines = String(p).split('\n').filter(l => l.trim() && !/^(The attached|Take only the identity|Two images are attached|Make a NEW picture)/.test(l));
    const out = [...lines.slice(1), lines[0] || ''].filter(Boolean).join('\n');
    if (out.length <= max) return out;
    const cut = out.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
    return (end > max * 0.6 ? cut.slice(0, end + 1) : cut).trim();
}
/** Реф меньше max px по большей стороне (MAI берёт рефы до ~1,4 Мп). */
async function shrinkDataUrl(d, max) {
    try {
        if (typeof Image === 'undefined' || typeof document === 'undefined') return d;
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = d; });
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        if (k >= 1) return d;
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * k);
        cv.height = Math.round(img.naturalHeight * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        return cv.toDataURL('image/jpeg', 0.9);
    } catch { return d; }
}
// что Atlas у модели уже не принял (до перезагрузки страницы): data URL вместо ссылок, base64 в ответе, имена размеров Krea
const atlasUrlOnly = new Set(), atlasNoB64 = new Set(), kreaAlt = new Set();
const MODERATION_RE = /moderat|flagged|sensitive|safety|policy|prohibit|nsfw/i;

export const NAISTERA_MODELS = ['nano banana', 'grok', 'grok-pro', 'novelai'];

export function normalizeNaistera(m) {
    const r = String(m || '').trim().toLowerCase();
    if (!r) return '';
    if (/banana/.test(r)) return 'nano banana';
    return NAISTERA_MODELS.includes(r) ? r : 'grok';
}

const DEFAULT_ENDPOINTS = {
    openrouter: 'https://openrouter.ai/api/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    xai: 'https://api.x.ai',
    openai: 'https://api.openai.com',
    naistera: 'https://naistera.org',
    atlas: 'https://api.atlascloud.ai',
};

export const SUPPORTED = Object.keys(DEFAULT_ENDPOINTS);

export function stylePrompt(s, kind = 'p') {
    if (s.imgStyle === 'custom') return String(s.imgStyleCustom || '').trim() || STYLES.sketch[kind];
    return (STYLES[s.imgStyle] || STYLES.sketch)[kind];
}

/** Рисует ли стиль человека (тогда к промпту можно приложить реф лица персонажа). */
export function styleHasPerson(s, slot = '') {
    return !!LOOK_KIND[slot] || !!STYLES[s.imgStyle]?.person;
}

export function itemPrompt(it, s, { personRef = false, photoRef = false } = {}) {
    const kind = LOOK_KIND[it.slot];
    const lines = [];
    if (kind) {
        lines.push(stylePrompt(s, 'look').replace('{kind}', kind));
        lines.push(`The ${kind}: ${it.name}.${it.desc ? ` ${it.desc}` : ''}`);
        if (kind === 'hairstyle') lines.push('Keep the person\'s own natural hair colour; only the hairstyle matters.');
    } else if (styleDetail(s, it.slot)) {
        const right = s.imgStyle === 'clover' ? DETAIL[it.slot].right : DETAIL[it.slot].right.replace('cheerful ', '');
        lines.push(styleDetail(s, it.slot).replace('{focus}', DETAIL[it.slot].focus).replace('{right}', right));
        lines.push(`The piece: ${it.name}.${it.desc ? ` ${it.desc}` : ''}`);
        lines.push('Both views show exactly this same piece with identical colour, material and details.');
    } else {
        lines.push(stylePrompt(s, 'p'));
        lines.push(`The item: ${it.name}.${it.desc ? ` ${it.desc}` : ''}`);
        if (!STYLES[s.imgStyle]?.person) lines.push('Show only this one item, centered, fully visible, nothing else in the frame.');
    }
    if (personRef && photoRef) lines.push('Two images are attached: image 1 is the person, image 2 is the photo of the item.');
    if (personRef) lines.push(PERSON_REF_RULE + (kind === 'hairstyle' ? ' Change only the hairstyle.' : kind === 'makeup' ? ' Change only the makeup.' : styleDetail(s, it.slot) ? ' Put this piece on them.' : ' Dress them in this item.'));
    if (personRef && STYLES[s.imgStyle]?.refNote) lines.push(STYLES[s.imgStyle].refNote);
    if (photoRef) lines.push('The attached photo shows the real item (maybe as part of a whole outfit): reproduce ONLY this item from it, keeping its exact colour, fabric and details.');
    return lines.join('\n');
}

/**
 * Промт обложки образа. set.prompt (считанный с фото или вставленный готовый) идёт описанием образа,
 * вещи — списком. outfitRef: приложено фото этого образа на другом человеке (импорт) — повторить одежду, не человека.
 */
export function setPrompt(set, items, s, { itemRefs = false, personRef = false, outfitRef = false } = {}) {
    const list = items.map((it, i) => `${i + 1}) ${LOOK_KIND[it.slot] ? `${LOOK_KIND[it.slot]}: ` : ''}${it.name}${it.desc ? ` — ${it.desc}` : ''}`).join('\n');
    const person = !!STYLES[s.imgStyle]?.person;
    const lines = [stylePrompt(s, 'set')];
    if (set.prompt) lines.push(`The outfit "${set.name}": ${set.prompt}`);
    if (list) {
        lines.push(set.prompt ? `Its pieces:\n${list}`
            : person ? `The outfit "${set.name}" is made of exactly these pieces:\n${list}`
                : `A neat flat-lay composition of one complete outfit "${set.name}", made of exactly these pieces, each fully visible:\n${list}`);
    } else if (!person) lines.push(`A neat flat-lay composition of this complete outfit, each piece fully visible.`);
    if (personRef) lines.push(`${PERSON_REF_RULE} Dress them in this outfit.`);
    if (personRef && STYLES[s.imgStyle]?.refNote) lines.push(STYLES[s.imgStyle].refNote);
    if (outfitRef) {
        lines.push(person
            ? `The ${personRef ? 'second' : ''} attached image shows this exact outfit worn by someone else: reproduce the clothes faithfully — the same pieces, colours, fabrics, cut, length and accessories — ${personRef ? 'on the person from the first image' : 'on a person'}. Ignore that other person's face, hair and body, and do not copy its background or art style.`.replace('The  ', 'The ')
            : 'The attached image shows this outfit on a person: reproduce exactly these garments as the flat-lay pieces, with the same colours, fabrics and details.');
    } else if (itemRefs) lines.push(`The ${personRef ? 'other ' : ''}attached images show these exact pieces — keep their colors, fabrics and details.`);
    if (!person) lines.push('No person wearing it.');
    return lines.join('\n');
}

/** Ключи из Телеграма часто приходят с невидимыми символами — из-за них 401. */
export function cleanKey(k) {
    return String(k || '').replace(/[​-‍﻿ \s]/g, '');
}

/** Подключение: профиль sillyimages, текущие настройки sillyimages или свои поля. */
export function resolveConnection(s, ext) {
    const silly = ext?.inline_image_gen;
    let c = null;
    // по умолчанию «sillyimages»; если его нет, а SLAY настроен — берём SLAY
    // «авто»: сначала SLAY (он у тебя рабочий), потом sillyimages.
    // В settings.json могут лежать СТАРЫЕ настройки sillyimages (их когда-то импортировал SLAY) —
    // со старым токеном и моделью, поэтому сами по себе они не выбираются.
    let src = s.imgSource || 'auto';
    if (src === 'auto') src = ext?.slay_image_gen?.apiKey ? 'slay' : silly ? 'silly' : 'own';
    s = { ...s, imgSource: src };
    if (s.imgSource === 'slay') {
        // SLAY Images: «openai» там — это chat/completions с картинкой (как у OpenRouter)
        const sl = ext?.slay_image_gen || {};
        const base = String(sl.endpoint || '').trim().replace(/\/+$/, '').replace(/\/v1(beta)?$/i, '');
        const slKey = sl.apiKey || sl.naisteraApiKey || sl.naisteraKey || sl.apiKeys?.[sl.apiType] || '';
        if (sl.apiType === 'atlas') {
            // наш патч SLAY: эндпоинт как есть (может быть свой прокси), модель — edit-версия, чтобы держать лицо
            let loras = [];
            try { const x = JSON.parse(String(sl.atlasLoras || '').trim() || '[]'); if (Array.isArray(x)) loras = x; } catch { /* не JSON */ }
            c = { apiType: 'atlas', endpoint: String(sl.endpoint || '').trim().replace(/\/+$/, ''), apiKey: slKey, model: atlasTakesRefs(sl.atlasModel) ? sl.atlasModel : '', loras, loraTriggers: String(sl.atlasTriggers || '').trim() };
        } else if (sl.apiType === 'naistera') c = { apiType: 'naistera', endpoint: base, apiKey: slKey, model: normalizeNaistera(sl.naisteraModel) || 'grok' };
        else if (sl.apiType === 'gemini') c = { apiType: 'gemini', endpoint: base, apiKey: sl.apiKey, model: sl.model };
        else if (sl.apiType === 'openai' || sl.apiType === 'custom') c = { apiType: 'openrouter', endpoint: base ? `${base}/v1` : '', apiKey: slKey, model: sl.model };
        else return { error: `Профиль SLAY (${sl.apiType || '—'}) гардероб рисовать не умеет. Нужен Atlas, Naistera, OpenAI (OpenRouter) или Gemini.` };
    } else if (s.imgSource === 'own') {
        c = { apiType: s.imgProvider, endpoint: '', apiKey: s.imgKey, model: s.imgProvider === 'naistera' ? (s.imgNaisteraModel || 'nano banana') : s.imgProvider === 'atlas' ? '' : s.imgModel, rawEndpoint: false };
    } else if (s.imgSource && s.imgSource !== 'silly' && silly?.connectionProfiles) {
        c = silly.connectionProfiles.find(p => p.id === s.imgSource) || null;
    }
    if (!c && silly && s.imgSource !== 'own' && s.imgSource !== 'slay') c = silly;
    if (c && c.apiType === 'naistera' && !c.model) c = { ...c, model: normalizeNaistera(c.naisteraModel) || 'grok' };
    if (!c) return { error: 'Нет подключения для картинок: выбери в ⚙ профиль sillyimages или впиши свой ключ.' };
    const apiType = String(c.apiType || '');
    if (!SUPPORTED.includes(apiType)) {
        return { error: `Этот профиль картинок (${apiType || '—'}) гардероб рисовать не умеет. Нужен Atlas, Naistera, OpenRouter, Gemini, xAI или OpenAI.` };
    }
    if (!cleanKey(c.apiKey)) return { error: 'В выбранном подключении картинок нет API-ключа.' };
    let model = String(c.model || '').trim() || DEFAULT_MODELS[apiType];
    if (apiType === 'naistera') {
        // своя модель для вещей; NovelAI понимает только теги — для вещей берём Nano Banana
        model = normalizeNaistera(s.imgNaisteraModel) || normalizeNaistera(model) || 'grok';
        if (model === 'novelai' && !s.imgNaisteraModel) model = 'nano banana';
    }
    if (apiType === 'atlas') model = ATLAS_EDIT[s.imgAtlasModel] ? s.imgAtlasModel : (ATLAS_EDIT[c.model] ? c.model : DEFAULT_MODELS.atlas);
    return {
        apiType,
        apiKey: cleanKey(c.apiKey),
        model,
        endpoint: String(c.endpoint || '').trim().replace(/\/+$/, '') || DEFAULT_ENDPOINTS[apiType],
        rawEndpoint: !!c.rawEndpoint,
        ...(apiType === 'atlas' ? { loras: c.loras || [], loraTriggers: c.loraTriggers || '' } : {}),
    };
}

function url(conn, suffix) {
    return conn.rawEndpoint ? conn.endpoint : `${conn.endpoint}${suffix}`;
}

async function fail(r, who) {
    const raw = await r.text().catch(() => '');
    let msg = raw;
    try {
        const j = JSON.parse(raw);
        msg = typeof j.error === 'string' ? j.error : (j.error?.message || j.detail || j.message || raw);
        if (typeof msg === 'object') msg = JSON.stringify(msg);
    } catch { /* не JSON */ }
    const hint = r.status === 401 || r.status === 403 ? ' — ключ/токен не принят: проверь его в настройках (или впиши свой в ⚙ гардероба)'
        : r.status === 429 ? ' — слишком часто, сервис просит подождать'
            : r.status >= 500 ? ' — сервис картинок не справился' : '';
    const err = new Error(`${who} ${r.status}${hint}: ${String(msg).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)}`);
    err.status = r.status;
    err.retryAfter = Number(r.headers?.get?.('retry-after')) || 0;
    throw err;
}

function withTimeout(ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    return { signal: ac.signal, done: () => clearTimeout(t) };
}

/** refs — data:URL картинок-образцов (только OpenRouter/Gemini). Возвращает data:URL или http-ссылку. */
function atlasImage(obj) {
    const d = obj?.data ? obj.data : (obj || {});
    const pick = (x) => (typeof x === 'string' ? x : (x?.image_url || x?.url || x?.image || null));
    if (Array.isArray(d.outputs) && d.outputs.length) return pick(d.outputs[0]);
    if (d.output) return Array.isArray(d.output) ? pick(d.output[0]) : pick(d.output);
    if (d.image_url) return d.image_url;
    if (Array.isArray(d.images) && d.images.length) return pick(d.images[0]);
    return null;
}

function atlasOut(out) {
    const s = String(out || '');
    if (s.startsWith('data:') || /^https?:\/\//i.test(s)) return s;
    return `data:image/jpeg;base64,${s}`; // enable_base64_output отдаёт голый base64
}

async function atlasUpload(base, key, dataUrl, signal) {
    const comma = dataUrl.indexOf(',');
    const mime = dataUrl.slice(5, comma).split(';')[0] || 'image/jpeg';
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: mime }), mime.includes('png') ? 'ref.png' : 'ref.jpg');
    const r = await fetch(`${base}/api/v1/model/uploadMedia`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal });
    if (!r.ok) await fail(r, 'Atlas (загрузка рефа)');
    const j = await r.json();
    const u = j?.data?.download_url || j?.download_url || j?.data?.url || j?.url;
    if (!u) throw new Error('Atlas: реф не загрузился');
    return u;
}

/** Повтор при перегрузке сервиса (429/5xx): ещё 2 попытки с паузой. */
export async function generateImage(conn, prompt, refs = [], opts = {}) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await generateImageOnce(conn, prompt, refs, opts);
        } catch (e) {
            last = e;
            if (!(e?.status === 429 || e?.status >= 500) || attempt === 2) throw e;
            // лимит частоты: ждём, сколько просит сервис (или 20 и 40 секунд); сбой сервера — 4 и 8 секунд
            const wait = e.status === 429 ? Math.min(90, e.retryAfter || 20 * (attempt + 1)) * 1000 : 4000 * (attempt + 1);
            opts.onWait?.(Math.round(wait / 1000), e.status);
            await new Promise(r => setTimeout(r, wait));
        }
    }
    throw last;
}

async function generateImageOnce(conn, prompt, refs = [], { aspect = '1:1', timeoutMs = 180000 } = {}) {
    const to = withTimeout(timeoutMs);
    try {
        if (conn.apiType === 'openrouter') {
            const content = refs.length
                ? [...refs.map(u => ({ type: 'image_url', image_url: { url: u } })), { type: 'text', text: prompt }]
                : prompt;
            const headers = { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' };
            if (/openrouter\.ai/.test(conn.endpoint)) {
                headers['HTTP-Referer'] = location.origin;
                headers['X-Title'] = 'SillyTavern Wardrobe';
            }
            const r = await fetch(url(conn, '/chat/completions'), {
                method: 'POST',
                headers,
                signal: to.signal,
                body: JSON.stringify({
                    model: conn.model,
                    messages: [{ role: 'user', content }],
                    modalities: /gemini|banana/i.test(conn.model) ? ['image', 'text'] : ['image'],
                    image_config: { aspect_ratio: aspect },
                    enable_base64_output: true,
                }),
            });
            if (!r.ok) await fail(r, 'OpenRouter');
            const j = await r.json();
            const m = j?.choices?.[0]?.message || {};
            for (const img of Array.isArray(m.images) ? m.images : []) {
                if (img?.image_url?.url) return img.image_url.url;
                if (img?.url) return img.url;
                if (img?.b64_json) return `data:image/png;base64,${img.b64_json}`;
            }
            for (const p of Array.isArray(m.content) ? m.content : []) {
                if (p?.type === 'image_url' && p.image_url?.url) return p.image_url.url;
            }
            throw new Error(`OpenRouter не вернул картинку${m.content && typeof m.content === 'string' ? `: ${m.content.slice(0, 160)}` : ''}`);
        }

        if (conn.apiType === 'gemini') {
            const parts = refs.map(u => ({ inlineData: { mimeType: u.slice(5, u.indexOf(';')) || 'image/jpeg', data: u.split(',')[1] } }));
            parts.push({ text: prompt });
            const u = url(conn, `/v1beta/models/${conn.model}:generateContent`);
            const auth = /googleapis\.com/.test(u) ? { 'x-goog-api-key': conn.apiKey } : { Authorization: `Bearer ${conn.apiKey}` };
            const r = await fetch(u, {
                method: 'POST',
                headers: { ...auth, 'Content-Type': 'application/json' },
                signal: to.signal,
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect } },
                }),
            });
            if (!r.ok) await fail(r, 'Gemini');
            const j = await r.json();
            for (const p of j?.candidates?.[0]?.content?.parts || []) {
                if (p.inlineData) return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
                if (p.inline_data) return `data:${p.inline_data.mime_type};base64,${p.inline_data.data}`;
            }
            throw new Error(`Gemini не вернул картинку (${j?.candidates?.[0]?.finishReason || j?.promptFeedback?.blockReason || 'без причины'})`);
        }

        if (conn.apiType === 'atlas') {
            const base = conn.endpoint;
            const info = ATLAS_EDIT[conn.model] || ATLAS_EDIT[DEFAULT_MODELS.atlas];
            let useRefs = refs.slice(0, info.max || 0);
            const model = useRefs.length ? conn.model : (info.t2i || conn.model);
            const auth = { Authorization: `Bearer ${conn.apiKey}` };
            const ar = /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(aspect) ? aspect : '2:3';
            let p = prompt;
            if (info.lora && conn.loraTriggers) p = `${conn.loraTriggers}\n${p}`;
            if (useRefs.length && info.compose) p = `${COMPOSE_NOTE}\n${p}`;
            let body;
            let refsAreUrls = false;
            if (info.kind === 'kontext') {
                body = useRefs.length
                    ? { model, prompt: p, num_images: 1, enable_base64_output: true, seed: -1, guidance_scale: 2.5, num_inference_steps: 28, image: useRefs[0] }
                    : { model, prompt: p, num_images: 1, enable_base64_output: true, seed: -1, size: '1024*1024', guidance_scale: 3.5 };
                if (info.lora && conn.loras?.length) body.loras = conn.loras;
            } else if (info.kind === 'fluxdev') {
                body = { model, prompt: p, num_images: 1, enable_base64_output: true, seed: -1, size: '1024*1024', guidance_scale: 3.5, strength: 0.8 };
                if (info.lora && conn.loras?.length) body.loras = conn.loras;
            } else {
                body = { model, prompt: info.kind === 'mj' ? mjPrompt(p) : p, enable_base64_output: true };
                const k = info.kind;
                if (k === 'gpt') {
                    const [w, h] = ar.split(':').map(Number);
                    body.size = w > h ? '1536x1024' : w < h ? '1024x1536' : '1024x1024';
                    body.quality = 'high';
                } else if (k === 'seedream') { body.size = seedreamSize(ar, SEEDREAM_SIZES); body.output_format = 'jpeg'; }
                else if (k === 'seedream55') { body.size = seedreamSize(ar, SEEDREAM55_SIZES, true); body.output_format = 'jpeg'; }
                else if (k === 'flux3') { body.aspect_ratio = snapAspect(ar, 'flux3'); body.resolution = '1k'; body.output_format = 'jpeg'; body.safety_tolerance = 4; }
                else if (k === 'mai') {
                    if (useRefs.length) { body.size = 'auto'; useRefs = await Promise.all(useRefs.map(d => shrinkDataUrl(d, 1152))); }
                    body.prompt = `${body.prompt}\n\n${frameHint(ar)}`;
                } else if (k === 'qwen') { body.size = qwenSize(ar, useRefs.length ? 1440 : 2048); body.n = 1; body.prompt_extend = false; }
                else if (k === 'wan') {
                    if (useRefs.length) { body.size = '2K'; body.n = 1; }
                    body.prompt = `${body.prompt}\n\n${frameHint(ar)}`;
                } else if (k === 'grok2') { body.aspect_ratio = snapAspect(ar, 'grok2'); body.resolution = '1k'; body.quality = 'medium'; body.num_images = 1; }
                else if (k === 'krea') { body.image_size = kreaSize(ar, kreaAlt.has(model)); body.num_images = 1; body.output_format = 'jpeg'; }
                else if (k === 'mj') { body.aspect_ratio = snapAspect(ar, 'mj'); body.stylize = 100; body.quality = 1; }
                else {
                    body.aspect_ratio = snapAspect(ar, k);
                    if (k === 'grok') body.resolution = '1k';
                }
                if (useRefs.length && (info.url || atlasUrlOnly.has(model))) {
                    // Midjourney (и модель, у которой Atlas уже не принял data URL) — картинки только ссылками, грузим сразу
                    const urls = [];
                    for (const u of useRefs) urls.push(await atlasUpload(base, conn.apiKey, u, to.signal));
                    useRefs = urls;
                    refsAreUrls = true;
                }
                if (useRefs.length) body[info.field] = info.single ? useRefs[0] : useRefs;
                if (atlasNoB64.has(model)) delete body.enable_base64_output;
            }
            const submit = () => fetch(`${base}/api/v1/model/generateImage`, {
                method: 'POST',
                headers: { ...auth, 'Content-Type': 'application/json' },
                signal: to.signal,
                body: JSON.stringify(body),
            });
            const retryable = (st) => st >= 400 && st < 500 && ![401, 402, 429].includes(st);
            let r = await submit();
            if (!r.ok && useRefs.length && !refsAreUrls && info.kind !== 'kontext' && retryable(r.status)) {
                // некоторые модели хотят ссылки, а не data:URI — заливаем рефы на Atlas и пробуем ещё раз
                const why = await r.clone().text().catch(() => '');
                if (!MODERATION_RE.test(why)) {
                    const urls = [];
                    for (const u of useRefs) urls.push(await atlasUpload(base, conn.apiKey, u, to.signal));
                    body[info.field] = info.single ? urls[0] : urls;
                    r = await submit();
                    if (r.ok) atlasUrlOnly.add(model);
                }
            }
            // модели с неполной схемой: на отказ «не тот параметр» — другие имена размеров (Krea) или без base64
            for (let tries = 0; tries < 2 && info.loose && !r.ok && retryable(r.status); tries++) {
                const why = await r.clone().text().catch(() => '');
                if (MODERATION_RE.test(why)) break;
                const sizeSwap = !!body.image_size && !kreaAlt.has(model) && /image_size|portrait|size/i.test(why);
                if (sizeSwap) body.image_size = kreaSize(ar, true);
                else if ('enable_base64_output' in body) delete body.enable_base64_output;
                else break;
                r = await submit();
                if (r.ok) (sizeSwap ? kreaAlt : atlasNoB64).add(model);
            }
            if (!r.ok) await fail(r, 'Atlas');
            const j = await r.json();
            const now = atlasImage(j);
            if (now) return atlasOut(now);
            const id = j?.data?.id || j?.id || j?.request_id || j?.data?.request_id;
            if (!id) throw new Error(`Atlas не вернул id задачи: ${JSON.stringify(j).slice(0, 200)}`);
            const started = Date.now();
            while (Date.now() - started < timeoutMs) {
                await new Promise(res => setTimeout(res, 2000));
                const pr = await fetch(`${base}/api/v1/model/prediction/${encodeURIComponent(id)}`, { headers: auth, signal: to.signal });
                if (!pr.ok) await fail(pr, 'Atlas');
                const pj = await pr.json();
                const st = String(pj?.data?.status || pj?.status || '').toLowerCase();
                if (['completed', 'succeeded', 'success'].includes(st)) {
                    const u = atlasImage(pj);
                    if (!u) throw new Error('Atlas: готово, но без картинки');
                    return atlasOut(u);
                }
                if (['failed', 'error', 'canceled', 'cancelled'].includes(st)) {
                    const why = JSON.stringify(pj?.data?.error || pj?.error || pj).slice(0, 300);
                    const e = new Error(`Atlas не нарисовал: ${why}`);
                    e.status = /moderat|safety|nsfw|celebr|policy|sensitive/i.test(why) ? 451 : 0;
                    throw e;
                }
            }
            throw new Error('Atlas: картинка рисовалась слишком долго (таймаут)');
        }

        if (conn.apiType === 'naistera') {
            const base = conn.endpoint.replace(/\/api\/generate\/?$/i, '');
            const body = { prompt, aspect_ratio: aspect, model: conn.model };
            if (refs.length) body.reference_images = refs.slice(0, 6);
            const r = await fetch(`${base}/api/generate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
                signal: to.signal,
                body: JSON.stringify(body),
            });
            if (!r.ok) await fail(r, 'Naistera');
            let j = await r.json();
            if (j?.job_id && !j?.data_url) {
                // очередь Naistera: опрашиваем задачу
                const started = Date.now();
                while (Date.now() - started < timeoutMs) {
                    await new Promise(res => setTimeout(res, 3000));
                    const pr = await fetch(`${base}/api/generate/jobs/${encodeURIComponent(j.job_id)}`, {
                        headers: { Authorization: `Bearer ${conn.apiKey}`, Accept: 'application/json' },
                        signal: to.signal,
                    });
                    if (!pr.ok) await fail(pr, 'Naistera');
                    const pj = await pr.json().catch(() => null);
                    if (pj?.data_url) { j = pj; break; }
                    if (/fail|error|cancel/i.test(String(pj?.status || ''))) throw new Error(`Naistera: ${pj?.error || pj?.status}`);
                }
            }
            if (j?.data_url) return j.data_url;
            throw new Error(`Naistera не вернула картинку${j?.error ? `: ${String(j.error).slice(0, 200)}` : ''}`);
        }

        // xAI и OpenAI-совместимые: images/generations
        const body = conn.apiType === 'xai'
            ? { model: conn.model, prompt, n: 1, response_format: 'b64_json', aspect_ratio: aspect }
            : { model: conn.model, prompt, n: 1, size: '1024x1024', ...(/dall-e/i.test(conn.model) ? { response_format: 'b64_json' } : {}) };
        const r = await fetch(url(conn, '/v1/images/generations'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
            signal: to.signal,
            body: JSON.stringify(body),
        });
        if (!r.ok) await fail(r, conn.apiType === 'xai' ? 'xAI' : 'OpenAI');
        const j = await r.json();
        const d = j?.data?.[0];
        if (d?.b64_json) return `data:image/${conn.apiType === 'xai' ? 'jpeg' : 'png'};base64,${d.b64_json}`;
        if (d?.url) return d.url;
        throw new Error('провайдер не вернул картинку');
    } catch (e) {
        if (e?.name === 'AbortError') throw new Error('картинка рисовалась слишком долго (таймаут)');
        throw e;
    } finally {
        to.done();
    }
}
