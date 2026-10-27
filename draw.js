// 👗 Гардероб — картинки вещей и комплектов.
// Рисует через провайдеров картинок напрямую из браузера (как sillyimages):
// OpenRouter (Nano Banana и др.), Gemini, xAI (Grok), OpenAI-совместимые.
// Подключение берётся из профилей sillyimages или из своих полей в настройках гардероба.

export const STYLES = {
    clover: {
        t: 'Лукбук на человеке (как в CLOVER)',
        person: true,
        p: 'Fashion lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading and crisp linework: one person wearing this item (with simple neutral basics for the rest), shown twice — a full-body standing pose on the left and a cheerful waist-up close-up on the right. Solid black background with a faint white grid on the left half, playful hand-drawn white doodles around (little stars, hearts, sparkles, exclamation marks). Warm natural skin, expressive but natural face. No text, no logo.',
        set: 'Fashion lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading and crisp linework: one person wearing this complete outfit, shown twice — a full-body standing pose on the left and a cheerful waist-up close-up on the right. Solid black background with a faint white grid on the left half, playful hand-drawn white doodles around (little stars, hearts, sparkles, exclamation marks). Warm natural skin, expressive but natural face. No text, no logo.',
        look: 'Beauty lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading: one person shown twice — a head-and-shoulders close-up from the front on the right and a three-quarter view on the left, to showcase the {kind} clearly. Solid black background, playful hand-drawn white doodles (stars, sparkles, hearts). No text, no logo.',
    },
    sketch: {
        t: 'Скетч модельера (акварель)',
        p: 'Fashion design illustration: watercolor and fine ink sketch of a single garment on clean off-white paper, elegant loose brushwork, soft natural shadow, the item drawn alone, no model, no person, no mannequin, no hands, no text, no logo.',
        set: 'Fashion design illustration: watercolor and fine ink sketch on clean off-white paper, elegant loose brushwork, soft natural shadow, no model, no person, no mannequin, no hands, no text, no logo.',
        look: 'Beauty fashion illustration: watercolor and fine ink sketch of a head-and-shoulders portrait on clean off-white paper, elegant loose brushwork, focused on showing the {kind}. No text, no logo.',
    },
    photo: {
        t: 'Фото из каталога',
        p: 'E-commerce catalog product photo of a single garment, ghost mannequin or neat flat lay, plain light-grey seamless background, soft diffused studio light, high detail fabric texture, no person, no text, no logo.',
        set: 'Editorial flat-lay product photo, plain light-grey seamless background, soft diffused studio light, high detail fabric texture, no person, no text, no logo.',
        look: 'Beauty editorial photo, head-and-shoulders portrait on a plain light-grey background, soft diffused studio light, focused on showing the {kind}. No text, no logo.',
    },
    anime: {
        t: 'Аниме-иллюстрация',
        p: 'Anime style item illustration of a single garment, clean lineart, soft cel shading, pastel palette, plain white background, no person, no text.',
        set: 'Anime style illustration, clean lineart, soft cel shading, pastel palette, plain white background, no person, no text.',
        look: 'Anime style head-and-shoulders portrait, clean lineart, soft cel shading, pastel palette, plain white background, focused on showing the {kind}. No text.',
    },
    pixel: {
        t: 'Иконка (как в игре)',
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
const DETAIL_PROMPT = 'Fashion lookbook illustration in a clean semi-realistic digital sketch style with soft colored-pencil shading and crisp linework, two panels side by side: on the left a large, detailed close-up of {focus}; on the right {right}, dressed in simple plain neutral basics so this piece stands out as the hero. Solid black background with a faint white grid behind the close-up, playful hand-drawn white doodles around (little stars, hearts, sparkles, exclamation marks). Warm natural skin, expressive but natural face. No text, no logo.';
const PERSON_REF_RULE = 'The attached reference image shows the exact person: keep their face, features, skin tone and body type exactly as in the reference.';

export const DEFAULT_MODELS = {
    openrouter: 'google/gemini-3.1-flash-image',
    gemini: 'gemini-3.1-flash-image-preview',
    xai: 'grok-imagine-image-2.0',
    openai: 'gpt-image-1',
    naistera: 'nano banana',
};

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
    } else if (s.imgStyle === 'clover' && DETAIL[it.slot]) {
        lines.push(DETAIL_PROMPT.replace('{focus}', DETAIL[it.slot].focus).replace('{right}', DETAIL[it.slot].right));
        lines.push(`The piece: ${it.name}.${it.desc ? ` ${it.desc}` : ''}`);
        lines.push('Both panels show exactly this same piece with identical colour, material and details.');
    } else {
        lines.push(stylePrompt(s, 'p'));
        lines.push(`The item: ${it.name}.${it.desc ? ` ${it.desc}` : ''}`);
        if (!STYLES[s.imgStyle]?.person) lines.push('Show only this one item, centered, fully visible, nothing else in the frame.');
    }
    if (personRef && photoRef) lines.push('Two images are attached: image 1 is the person, image 2 is the photo of the item.');
    if (personRef) lines.push(PERSON_REF_RULE + (kind === 'hairstyle' ? ' Change only the hairstyle.' : kind === 'makeup' ? ' Change only the makeup.' : DETAIL[it.slot] && s.imgStyle === 'clover' ? ' Put this piece on them.' : ' Dress them in this item.'));
    if (photoRef) lines.push('The attached photo shows the real item (maybe as part of a whole outfit): reproduce ONLY this item from it, keeping its exact colour, fabric and details.');
    return lines.join('\n');
}

export function setPrompt(set, items, s, { itemRefs = false, personRef = false } = {}) {
    const list = items.map((it, i) => `${i + 1}) ${LOOK_KIND[it.slot] ? `${LOOK_KIND[it.slot]}: ` : ''}${it.name}${it.desc ? ` — ${it.desc}` : ''}`).join('\n');
    const person = !!STYLES[s.imgStyle]?.person;
    return `${stylePrompt(s, 'set')}\n`
        + (person ? `The outfit "${set.name}" is made of exactly these pieces:\n` : `A neat flat-lay composition of one complete outfit "${set.name}", made of exactly these pieces, each fully visible:\n`)
        + `${list}\n`
        + (personRef ? `${PERSON_REF_RULE} Dress them in this outfit.\n` : '')
        + (itemRefs ? `The ${personRef ? 'other ' : ''}attached images show these exact pieces — keep their colors, fabrics and details.\n` : '')
        + (person ? '' : 'No person wearing it.');
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
        if (sl.apiType === 'naistera') c = { apiType: 'naistera', endpoint: base, apiKey: slKey, model: normalizeNaistera(sl.naisteraModel) || 'grok' };
        else if (sl.apiType === 'gemini') c = { apiType: 'gemini', endpoint: base, apiKey: sl.apiKey, model: sl.model };
        else if (sl.apiType === 'openai' || sl.apiType === 'custom') c = { apiType: 'openrouter', endpoint: base ? `${base}/v1` : '', apiKey: slKey, model: sl.model };
        else return { error: `Профиль SLAY (${sl.apiType || '—'}) гардероб рисовать не умеет. Нужен Naistera, OpenAI (OpenRouter) или Gemini.` };
    } else if (s.imgSource === 'own') {
        c = { apiType: s.imgProvider, endpoint: '', apiKey: s.imgKey, model: s.imgProvider === 'naistera' ? (s.imgNaisteraModel || 'nano banana') : s.imgModel, rawEndpoint: false };
    } else if (s.imgSource && s.imgSource !== 'silly' && silly?.connectionProfiles) {
        c = silly.connectionProfiles.find(p => p.id === s.imgSource) || null;
    }
    if (!c && silly && s.imgSource !== 'own' && s.imgSource !== 'slay') c = silly;
    if (c && c.apiType === 'naistera' && !c.model) c = { ...c, model: normalizeNaistera(c.naisteraModel) || 'grok' };
    if (!c) return { error: 'Нет подключения для картинок: выбери в ⚙ профиль sillyimages или впиши свой ключ.' };
    const apiType = String(c.apiType || '');
    if (!SUPPORTED.includes(apiType)) {
        return { error: `Этот профиль картинок (${apiType || '—'}) гардероб рисовать не умеет. Нужен Naistera, OpenRouter, Gemini, xAI или OpenAI.` };
    }
    if (!cleanKey(c.apiKey)) return { error: 'В выбранном подключении картинок нет API-ключа.' };
    let model = String(c.model || '').trim() || DEFAULT_MODELS[apiType];
    if (apiType === 'naistera') {
        // своя модель для вещей; NovelAI понимает только теги — для вещей берём Nano Banana
        model = normalizeNaistera(s.imgNaisteraModel) || normalizeNaistera(model) || 'grok';
        if (model === 'novelai' && !s.imgNaisteraModel) model = 'nano banana';
    }
    return {
        apiType,
        apiKey: cleanKey(c.apiKey),
        model,
        endpoint: String(c.endpoint || '').trim().replace(/\/+$/, '') || DEFAULT_ENDPOINTS[apiType],
        rawEndpoint: !!c.rawEndpoint,
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
        msg = typeof j.error === 'string' ? j.error : (j.error?.message || j.message || raw);
    } catch { /* не JSON */ }
    const hint = r.status === 401 || r.status === 403 ? ' — ключ/токен не принят: проверь его в настройках (или впиши свой в ⚙ гардероба)' : '';
    throw new Error(`${who} ${r.status}${hint}: ${String(msg).slice(0, 300)}`);
}

function withTimeout(ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    return { signal: ac.signal, done: () => clearTimeout(t) };
}

/** refs — data:URL картинок-образцов (только OpenRouter/Gemini). Возвращает data:URL или http-ссылку. */
export async function generateImage(conn, prompt, refs = [], { aspect = '1:1', timeoutMs = 180000 } = {}) {
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
