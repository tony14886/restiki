# Pilot deployment runbook

Этот каталог разворачивает короткий FastMenu-пилот на одном VPS. Он не заменяет полную архитектуру из `docs/infrastructure-roadmap.md`.

## Что будет запущено

- `app`: существующий Node.js-сервис в `PILOT_MODE=1`;
- `cloudflared`: один remotely managed Cloudflare Tunnel;
- два Docker volume: данные меню/аналитики и загруженные изображения.

Ни один порт `app` не публикуется на хост. Tunnel обращается к сервису по внутреннему имени `app:3210`.

## Предварительные условия

1. Ubuntu 24.04 VPS с Docker Engine и Docker Compose v2.
2. Домен добавлен в Cloudflare, DNS-зона активна.
3. Решены точные имена, например `demo.menu-on.com` и `cabinet.menu-on.com`.
4. Доступ к VPS по SSH-ключу проверен. Не пересылайте пароль или private key в чат.

## Один раз в Cloudflare Dashboard

1. Откройте **Zero Trust → Networks → Tunnels** и создайте remotely managed tunnel `fastmenu-pilot`.
2. Выберите способ запуска **Docker** и скопируйте token прямо в защищённый файл `.env` на VPS.
3. Добавьте два Public Hostname, оба с service `http://app:3210`:
   - `demo.[ваш-домен]` — публичное меню;
   - `cabinet.[ваш-домен]` — кабинет ресторана.
4. Убедитесь, что HTTP Host Header до origin сохраняет hostname запроса. Это необходимо для серверной изоляции маршрутов.
5. Дождитесь статуса Healthy у tunnel и выпуска Universal SSL.

Для публичного сайта-визитки добавьте ещё два Public Hostname с service
`http://app:3210`: `menu-on.com` и `www.menu-on.com`. Основной домен не
попадает под wildcard `*.menu-on.com`, поэтому оба маршрута должны быть
заданы явно. На этих двух hostname сервер открывает только sales-landing и
`POST /api/demo-request`; заявки сохраняются во внутреннем volume приложения.

Не открывайте порт 3210 в firewall. После развёртывания версии с публикацией
демо добавьте третий Public Hostname: `*.menu-on.com` → `http://app:3210`.
Wildcard сам по себе не публикует сайт: Node отдаёт только `GET /` и
`GET /index.html` для hostname, который присутствует в реестре
`data/published-sites/sites.json` со статусом `active`. Неизвестный hostname и
все остальные пути получают `404`.

## Развёртывание на VPS

1. Скопируйте исходники без `node_modules`, `.env`, `.maps-browser-profile` и рабочих данных парсера в отдельный каталог, например `/opt/fastmenu-pilot`.
2. Перейдите в `/opt/fastmenu-pilot/deploy/pilot`.
3. Создайте `.env` из `.env.example`, задав реальные hostname, публичный origin, email, длинный уникальный пароль, сессионный secret и Tunnel token.
4. Выполните:

   ```bash
   docker compose up --build -d
   docker compose ps
   docker compose logs --tail=100 app cloudflared
   ```

При первом запуске entrypoint скопирует Café Harmony и его изображения в пустые Docker volume. При следующих пересборках эти данные сохранятся.

## Приёмка

Проверьте с внешнего браузера:

1. `https://demo.[домен]/` открывает меню.
2. `https://cabinet.[домен]/` открывает страницу входа.
3. Вход с заданными `ADMIN_EMAIL`/`ADMIN_PASSWORD` работает; изменение цены и Publish меняют публичное меню.
4. Созданный в кабинете QR ведёт на `https://demo.[домен]/r/...`.
5. `https://demo.[домен]/admin.html` отвечает 404.
6. `https://demo.[домен]/api/export` отвечает 404.
7. `https://cabinet.[домен]/menu` отвечает 404.
8. После добавления wildcard route неизвестный `https://anything.[домен]/` отвечает 404; опубликованный из локального «Прод» адрес отвечает 200.

Локальная диагностика контейнера:

```bash
docker compose exec app node -e "fetch('http://127.0.0.1:3210/healthz').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1) })"
```

## Сопровождение

```bash
# логи
docker compose logs -f app cloudflared

# обновить код, сохранив данные меню
docker compose up --build -d

# проверить volume
docker volume ls | grep fastmenu-pilot
```

Перед любой ручной заменой JSON сделайте резервную копию volumes. Основной путь изменения демонстрационного меню — кабинет, а не редактирование файлов на VPS.

## Персональный кабинет опубликованного демо

После публикации из локального раздела «Прод» оператор получает две ссылки:

- `https://<slug>.[домен]/` — публичный лендинг кафе;
- `https://cabinet.[домен]/sites/<slug>` — закрытый кабинет именно этого кафе.

При первой публикации локальный оператор получает сгенерированные логин и временный пароль один раз. VPS хранит только salted hash в `data/published-sites/site-admin/`. Кабинет изолирован по `siteId`: клиент управляет только своим меню, ценами, фото, часами, контактами, QR-кодами, аналитикой, черновиками, публикацией и историей версий. Публикация создаёт и активирует следующую версию статического HTML. Не отправляйте пароль внутри публичной части коммерческого предложения.

## Ограничение пилота

Общий кабинет на `cabinet.[домен]/admin.html` остаётся демонстрационной рабочей областью. Каждый персональный кабинет использует тот же полноценный интерфейс, но получает отдельную изолированную рабочую область по `siteId`. В пилоте клиент не меняет назначенный поддомен самостоятельно и не управляет паролем через интерфейс; эти функции добавляются в следующую архитектурную фазу.
