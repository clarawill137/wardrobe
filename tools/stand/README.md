# Стенд Гардероба

Не часть расширения (таверна грузит только `index.js` и `style.css` из манифеста). Это мок таверны для проверки
в настоящем Chrome на экране айфона: страница образов, «＋ Образ» с фото и промтом, разбор, версии картинок,
надеть, копирование промта, стиль, вкладки.

- `prep.mjs` — картинки в `samples/` (свои 2:3 — `samples/oil1.png`, `samples/oil2.png`, в репу не коммитить; без них — заглушки).
- `server.mjs` — статика + заглушки `/api/images/upload`, `/thumbnail`, `/characters`, `/User Avatars`.
- `index.html` — мок `SillyTavern.getContext()` (профиль, шкаф, образы, чат-группа), ИИ-разбор и OpenRouter-картинки подменены.
- `run.mjs` — основной прогон (≈40 проверок + скриншоты в `shots/`), `extra.mjs` — побочные пути.

```
node tools/stand/prep.mjs && node tools/stand/run.mjs && node tools/stand/extra.mjs
```

Нужны node 22, Chrome (`CHROME`, по умолчанию `/usr/bin/google-chrome`), playwright и sharp (`NODE_TOOLS` — папка
node_modules с ними), Font Awesome (`FA`).
