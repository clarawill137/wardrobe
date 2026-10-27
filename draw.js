// 👗 Гардероб — картинки вещей и комплектов.
// Рисует через провайдеров картинок напрямую из браузера (как sillyimages):
// OpenRouter (Nano Banana и др.), Gemini, xAI (Grok), OpenAI-совместимые.
// Подключение берётся из профилей sillyimages или из своих полей в настройках гардероба.

export const STYLES = {
    sketch: {
        t: 'Скетч модельера (акварель)',
        p: 'Fashion design illustration: watercolor and fine ink sketch of a single garment on clean off-white paper, elegant loose brushwork, soft natural shadow, the item drawn alone, no model, no person, no mannequin, no hands, no text, no logo.',
        set: 'Fashion design illustration: watercolor and fine ink sketch on clean off-white paper, elegant loose brushwork, soft natural shadow, no model, no person, no mannequin, no hands, no text, no logo.',
    },
    photo: {
        t: 'Фото из каталога',
        p: 'E-commerce catalog product photo of a single garment, ghost mannequin or neat flat lay, plain light-grey seamless background, soft diffused studio light, high detail fabric texture, no person, no text, no logo.',
        set: 'Editorial flat-lay product photo, plain light-grey seamless background, soft diffused studio light, high detail fabric texture, no person, no text, no logo.',
    },
    anime: {
        t: 'Аниме-иллюстрация',
        p: 'Anime style item illustration of a single garment, clean lineart, soft cel shading, pastel palette, plain white background, no person, no text.',
        set: 'Anime style illustration, clean lineart, soft cel shading, pastel palette, plain white background, no person, no text.',
    },
    pixel: {
        t: 'Иконка (как в игре)',
        p: 'Cute game inventory icon of a single clothing item, soft 3D render, rounded shapes, gentle pastel lighting, centered on a plain soft background, no person, no text.',
        set: 'Cute game inventory illustration, soft 3D render, rounded shapes, gentle pastel lighting, plain soft background, no person, no text.',
    },
};

export const DEFAULT_MODELS = {
    openrouter: 'google/gemini-3.1-flash-image',
    gemini: 'gemini-3.1-flash-image-preview',
    xai: 'grok-imagine-image-2.0',
    openai: 'gpt-image-1',
};

const DEFAULT_ENDPOINTS = {
    openrouter: 'https://openrouter.ai/api/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    xai: 'https://api.x.ai',
    openai: 'https://api.openai.com',
};

export const SUPPORTED = Object.keys(DEFAULT_ENDPOINTS);

export function stylePrompt(s, kind = 'p') {
    if (s.imgStyle === 'custom') return String(s.imgStyleCustom || '').trim() || STYLES.sketch[kind];
    return (STYLES[s.imgStyle] || STYLES.sketch)[kind];
}

export function itemPrompt(it, s) {
    return `${stylePrompt(s, 'p')}\nThe item: ${it.name}.${it.desc ? ` ${it.desc}` : ''}\nShow only this one item, centered, fully visible, nothing else in the frame.`;
}

export function setPrompt(set, items, s, withRefs = false) {
    const list = items.map((it, i) => `${i + 1}) ${it.name}${it.desc ? ` — ${it.desc}` : ''}`).join('\n');
    return `${stylePrompt(s, 'set')}\nA neat flat-lay composition of one complete outfit "${set.name}", made of exactly these pieces, each fully visible:\n${list}\n`
        + (withRefs ? 'The attached images show these exact pieces — keep their colors, fabrics and details.\n' : '')
        + 'No person wearing it.';
}

/** Подключение: профиль sillyimages, текущие настройки sillyimages или свои поля. */
export function resolveConnection(s, ext) {
    const silly = ext?.inline_image_gen;
    let c = null;
    if (s.imgSource === 'slay') {
        // SLAY Images: «openai» там — это chat/completions с картинкой (как у OpenRouter)
        const sl = ext?.slay_image_gen || {};
        const base = String(sl.endpoint || '').trim().replace(/\/+$/, '').replace(/\/v1(beta)?$/i, '');
        if (sl.apiType === 'gemini') c = { apiType: 'gemini', endpoint: base, apiKey: sl.apiKey, model: sl.model };
        else if (sl.apiType === 'openai' || sl.apiType === 'custom') c = { apiType: 'openrouter', endpoint: base ? `${base}/v1` : '', apiKey: sl.apiKey, model: sl.model };
        else return { error: `Профиль SLAY (${sl.apiType || '—'}) гардероб рисовать не умеет. Нужен режим OpenAI (OpenRouter) или Gemini.` };
    } else if (s.imgSource === 'own') {
        c = { apiType: s.imgProvider, endpoint: '', apiKey: s.imgKey, model: s.imgModel, rawEndpoint: false };
    } else if (s.imgSource && s.imgSource !== 'silly' && silly?.connectionProfiles) {
        c = silly.connectionProfiles.find(p => p.id === s.imgSource) || null;
    }
    if (!c && silly && s.imgSource !== 'own') c = silly;
    if (!c) return { error: 'Нет подключения для картинок: выбери в ⚙ профиль sillyimages или впиши свой ключ.' };
    const apiType = String(c.apiType || '');
    if (!SUPPORTED.includes(apiType)) {
        return { error: `Этот профиль картинок (${apiType || '—'}) гардероб рисовать не умеет. Нужен OpenRouter, Gemini, xAI или OpenAI.` };
    }
    if (!c.apiKey) return { error: 'В выбранном подключении картинок нет API-ключа.' };
    return {
        apiType,
        apiKey: String(c.apiKey).trim(),
        model: String(c.model || '').trim() || DEFAULT_MODELS[apiType],
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
    throw new Error(`${who} ${r.status}: ${String(msg).slice(0, 300)}`);
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
