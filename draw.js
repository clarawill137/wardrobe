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
    // по умолчанию «sillyimages»; если его нет, а SLAY настроен — берём SLAY
    let src = s.imgSource || 'silly';
    if (src === 'silly' && !silly && ext?.slay_image_gen?.apiKey) src = 'slay';
    s = { ...s, imgSource: src };
    if (s.imgSource === 'slay') {
        // SLAY Images: «openai» там — это chat/completions с картинкой (как у OpenRouter)
        const sl = ext?.slay_image_gen || {};
        const base = String(sl.endpoint || '').trim().replace(/\/+$/, '').replace(/\/v1(beta)?$/i, '');
        if (sl.apiType === 'naistera') c = { apiType: 'naistera', endpoint: base, apiKey: sl.apiKey, model: normalizeNaistera(sl.naisteraModel) || 'grok' };
        else if (sl.apiType === 'gemini') c = { apiType: 'gemini', endpoint: base, apiKey: sl.apiKey, model: sl.model };
        else if (sl.apiType === 'openai' || sl.apiType === 'custom') c = { apiType: 'openrouter', endpoint: base ? `${base}/v1` : '', apiKey: sl.apiKey, model: sl.model };
        else return { error: `Профиль SLAY (${sl.apiType || '—'}) гардероб рисовать не умеет. Нужен Naistera, OpenAI (OpenRouter) или Gemini.` };
    } else if (s.imgSource === 'own') {
        c = { apiType: s.imgProvider, endpoint: '', apiKey: s.imgKey, model: s.imgModel, rawEndpoint: false };
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
    if (!c.apiKey) return { error: 'В выбранном подключении картинок нет API-ключа.' };
    let model = String(c.model || '').trim() || DEFAULT_MODELS[apiType];
    if (apiType === 'naistera') {
        // своя модель для вещей; NovelAI понимает только теги — для вещей берём Nano Banana
        model = normalizeNaistera(s.imgNaisteraModel) || normalizeNaistera(model) || 'grok';
        if (model === 'novelai' && !s.imgNaisteraModel) model = 'nano banana';
    }
    return {
        apiType,
        apiKey: String(c.apiKey).trim(),
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
