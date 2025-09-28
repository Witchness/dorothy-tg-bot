# Code Review Suggestions

## Критичні проблеми
1. **Поділ рядків за code point-ами ламає офсети Telegram**
   - У `renderMessageHTML` під час побудови інсайтів ми ділимо текст через `Array.from(text).slice(offset, offset + length)`. Telegram передає `offset` та `length` у UTF-16 code units, тому для емодзі або surrogate-пар цей зріз повертає неправильні підрядки. У результаті посилання/хештеги в інсайтах показуються з обрізаними символами або «з’їжджають» на один символ.【F:src/renderer.ts†L175-L182】
   - **Що зробити:** перейти на `text.substring(offset, offset + length)` (або інший UTF-16-safe підхід), щоб використовувати ті самі code units, що і Telegram.

2. **Автоматичний cross-scope note перезаписує ручні нотатки**
   - `observeMessageKeys` і `observeEntityTypes` після кожної події обчислюють список scope-ів та безумовно замінюють `entry.note`. Якщо адміністратор додав нотатку через `/reg … note`, вона зникне при наступному оновленні статистики, бо автогенерована фраза «скоупи: …» перекриє значення з `registry-config.json`.【F:src/registry_status.ts†L200-L287】
   - **Що зробити:** зберігати авто-підказку в окремому полі (наприклад, `meta.scopes`) або заповнювати `note` лише коли її не задав користувач/конфіг.

3. **Параметр `seedFromHandled` у reset не працює**
   - Метод `reset(seedFromHandled = false)` ігнорує аргумент: усередині створюється чистий `defaultFile()` без жодного умовного гілкування. Це суперечить коментарю «do not seed from handled unless explicitly requested» і робить неможливим відновлення стану зі `handled`-знімка під час `/registry_reset hard` або потенційних майбутніх викликів.【F:src/registry_status.ts†L148-L153】
   - **Що зробити:** якщо `seedFromHandled === true`, перечитувати `data/handled/registry.json` (або дериватив) і ініціалізувати `this.data` його вмістом.

4. **Політика `SNAPSHOT_HANDLED_CHANGES=off` все одно пише файли**
   - Коли категорія snapshot-а = `handled`, а політика `off`, ми все одно перекидаємо його в `UNHANDLED_DIR` і пишемо на диск. Це суперечить очікуванню «не зберігати handled-знімки» й продовжує засмічувати репозиторій/диск на проді.【F:src/unhandled_logger.ts†L195-L224】
   - **Що зробити:** повністю пропускати збереження для handled-зразків, якщо політика `off`, залишаючи лише логування для «unknown».

## Поліпшення стабільності та DX
1. **Безпечніша відповідь для admin-оповіщень**
   - `notifyAdmin` напряму викликає `bot.api.sendMessage`. Для довгих текстів ми вже маємо `replySafe`, який прибирає сурогати та ріже повідомлення. Використати спільний helper (`sendSafeMessage`) з `replySafe` дозволить уникнути зривів алертів через «Bad Request: can't parse entities».【F:src/index.ts†L213-L236】【F:src/index.ts†L200-L212】

2. **Rate-limit для bulk-present**
   - У `presentall` ми послідовно викликаємо `replyWithPhoto|Video|…`. Великий альбом (10–20 елементів) може впертися в 30 повідомлень/сек і впіймати 429. Варто додати невеликий `sleep` між викликами або використовувати `api.sendMediaGroup` з вже збереженими `file_id` (Telegram це дозволяє) — тоді користувач отримає альбом одним запитом.【F:src/index.ts†L840-L869】

## Ідеї для розвитку функціоналу
1. **UI для порівняння «handled» vs «latest»**
   - Зараз `handled-changes` просто накопичує JSON. Було б корисно додати `/snapshots diff <label>` (або Markdown-звіт), що показує різницю між останнім handled-знімком і поточним payload-ом. Це допоможе швидше рев’ювати зміни API.

2. **Режим «custom updates» у старті**
   - Є лише `minimal`/`all`. Додайте `ALLOWED_UPDATES=custom` + `ALLOWED_UPDATES_LIST=message,edited_message,...` і підхоплюйте `allowed_updates` з env — це зменшить трафік під конкретні сценарії (наприклад, лише callback-и).【F:src/index.ts†L1008-L1023】【F:src/constants.ts†L1-L28】
