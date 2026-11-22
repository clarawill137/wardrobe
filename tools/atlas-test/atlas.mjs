const D = await import(new URL('../../draw.js', import.meta.url).href);
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const calls = [];
let script = [];   // очередь ответов на generateImage: { status, text } | null (= ок)
globalThis.fetch = async (url, opt = {}) => {
    if (String(url).endsWith('/uploadMedia')) { calls.push({ upload: true }); return new Response(JSON.stringify({ data: { download_url: 'https://x/ref.jpg' } }), { status: 200 }); }
    const body = opt.body ? JSON.parse(opt.body) : null;
    calls.push({ url, body });
    const next = script.shift();
    if (next) return new Response(next.text || 'bad', { status: next.status });
    return new Response(JSON.stringify({ data: { outputs: ['aGVsbG8='] } }), { status: 200 });
};
const conn = (model, extra = {}) => ({ apiType: 'atlas', apiKey: 'k', endpoint: 'https://api.atlascloud.ai', model, ...extra });
const face = 'data:image/jpeg;base64,/9j/AAA', photo = 'data:image/jpeg;base64,/9j/BBB';
const longPrompt = 'Realistic oil painting style line. '.repeat(30) + '\nThe outfit "Шуба": white fur coat, black leather trousers\nThe attached reference image shows the exact person.\nTake only the identity from the reference image.';
const run = async (model, refs = [face, photo], extra = {}, prompt = 'P') => { calls.length = 0; await D.generateImage(conn(model, extra), prompt, refs, { aspect: '2:3' }); return calls.filter(c => c.body); };
const models = Object.keys(D.ATLAS_EDIT);
ok(models.length === 20, `все рисовалки SLAY: ${models.length}`);
for (const m of models) {
    const info = D.ATLAS_EDIT[m];
    const b = (await run(m, info.max ? [face, photo] : []))[0]?.body;
    ok(!!b && typeof b.prompt === 'string', `${m}: запрос ушёл (${b?.model})`);
}
let b = (await run('bytedance/seedream-v5.0-pro/edit'))[0].body;
ok(b.size === '1664*2496' && b.images.length === 2 && b.output_format === 'jpeg', `Seedream 5.0: размер ${b.size}, 2 рефа`);
b = (await run('bytedance/seedream-v5.5/edit'))[0].body;
ok(b.size === '1664*2496' && b.reference_images.length === 2, `Seedream 5.5: ${b.size}, reference_images`);
b = (await run('black-forest-labs/flux-3/edit'))[0].body;
ok(b.aspect_ratio === '2:3' && b.safety_tolerance === 4 && b.reference_images, 'FLUX 3: 2:3, мягкий фильтр');
b = (await run('microsoft/mai-image-2.6/edit'))[0].body;
ok(b.size === 'auto' && /Frame: vertical/.test(b.prompt) && /^Make a NEW picture/.test(b.prompt), 'MAI: size auto, кадр словами, «новая картинка»');
b = (await run('qwen-image-3.0-pro/edit'))[0].body;
ok(b.size === '960*1440' && b.prompt_extend === false && b.reference_image_urls.length === 2, `Qwen: ${b.size}`);
b = (await run('alibaba/wan-2.7-pro/image-edit'))[0].body;
ok(b.size === '2K' && b.n === 1 && b.images.length === 2, 'Wan: 2K');
b = (await run('xai/grok-imagine-image-2.0/edit'))[0].body;
ok(b.aspect_ratio === '2:3' && b.quality === 'medium' && b.image_urls.length === 2, 'Grok 2.0');
const mj = await run('midjourney/v8.2/image-to-image', [face], {}, longPrompt);
ok(calls.some(c => c.upload) && mj[0].body.image === 'https://x/ref.jpg', 'Midjourney: реф сначала залит, одна ссылка');
ok(mj[0].body.prompt.length <= 1000 && mj[0].body.prompt.startsWith('The outfit') && !/attached/.test(mj[0].body.prompt), `Midjourney: промт ${mj[0].body.prompt.length} знаков, образ первым, без строк о рефах`);
b = (await run('midjourney/v8.2/text-to-image', []))[0].body;
ok(b.aspect_ratio === '2:3' && b.stylize === 100, 'Midjourney без рефов');
b = (await run('krea-2-turbo/text-to-image', []))[0].body;
ok(b.image_size === 'portrait_3_4' && b.num_images === 1, `Krea: ${b.image_size}`);
b = (await run('google/nano-banana-pro/edit', []))[0].body;
ok(b.model === 'google/nano-banana-pro/text-to-image', 'edit без рефов → своя t2i-версия');
b = (await run('black-forest-labs/flux-kontext-dev-lora', [face], { loras: [{ path: 'u/l', scale: 1 }], loraTriggers: 'hdy' }))[0].body;
ok(b.loras?.length === 1 && b.prompt.startsWith('hdy') && b.image === face, 'Kontext LoRA: LoRA и триггеры из SLAY');
b = (await run('black-forest-labs/flux-dev', []))[0].body;
ok(b.size === '1024*1024' && b.guidance_scale === 3.5 && !b.image, 'Flux Dev: по тексту');
// отказ data:URI → заливка и повтор
script = [{ status: 400, text: 'images must be urls' }];
const two = await run('bytedance/seedream-v5.0-pro/edit');
ok(two.length === 2 && two[1].body.images[0] === 'https://x/ref.jpg', 'data:URI не приняли — рефы залиты, повтор');
// loose: отказ «не тот параметр» → без base64
script = [{ status: 400, text: 'images must be urls' }, { status: 422, text: 'unknown field enable_base64_output' }];
const three = await run('black-forest-labs/flux-3/edit');
ok(three.length === 3 && !('enable_base64_output' in three[2].body), 'FLUX 3: не тот параметр — без base64');
// модерация — без повторов
script = [{ status: 400, text: 'flagged by safety system' }];
let err = null; try { await run('microsoft/mai-image-2.6/edit'); } catch (e) { err = e; }
ok(err && calls.filter(c => c.body).length === 1, 'отказ фильтра — без лишних повторов');
ok(D.atlasTakesRefs('midjourney/v8.2/image-to-image') && !D.atlasTakesRefs('krea-2-turbo/text-to-image'), 'atlasTakesRefs');
// подключение «как в SLAY»: модель без рефов — по умолчанию Nano dev
const ext = { slay_image_gen: { apiType: 'atlas', apiKey: 'k', atlasModel: 'krea-2-turbo/text-to-image' } };
ok(D.resolveConnection({ imgSource: 'slay' }, ext).model === 'google/nano-banana-pro/edit-developer', 'SLAY на модели без рефов — гардероб берёт Nano dev');
ext.slay_image_gen.atlasModel = 'bytedance/seedream-v5.5/edit';
ok(D.resolveConnection({ imgSource: 'slay' }, ext).model === 'bytedance/seedream-v5.5/edit', 'SLAY на Seedream 5.5 — и гардероб тоже');
ok(D.resolveConnection({ imgSource: 'slay', imgAtlasModel: 'krea-2-turbo/text-to-image' }, ext).model === 'krea-2-turbo/text-to-image', 'свой выбор в гардеробе — любой из списка');
console.log(fails ? `ПРОВАЛЕНО ${fails}` : 'всё прошло'); process.exit(fails ? 1 : 0);
