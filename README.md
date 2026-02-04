# Google Workspace Account Registrar

Бэкенд + админка для автоматического создания аккаунтов Google Workspace. Полный цикл: создание через Admin SDK, вход в браузере через GoLogin (антидетект), установка recovery email, получение OTP через IMAP.

---

## Что умеет

- Создание аккаунтов Google Workspace через Admin SDK
- Автоматический вход в созданные аккаунты через браузер
- Антидетект браузер через GoLogin (fingerprint, профили)
- Ротация прокси через Webshare (rotating + sticky сессии)
- Установка recovery email в аккаунт
- Получение OTP кодов через IMAP
- Управление API ключами с квотами
- Админ-панель на React
- Экспорт аккаунтов в TXT/JSON

---

## Требования

- Node.js 18+
- PostgreSQL 14+ (или Docker)
- Redis (для очередей, опционально)
- Аккаунт GoLogin с API ключом
- Аккаунт Webshare с прокси
- Google Workspace с настроенным Admin SDK
- Gmail аккаунт для recovery email (с включенным IMAP)

---

## Быстрый старт

### 1. Клонируй репу

```bash
git clone https://github.com/redzov/googlebackend-mdenis99.git
cd googlebackend-mdenis99
```

### 2. Поставь зависимости

```bash
# Бэкенд
npm install

# Фронтенд
cd frontend
npm install
cd ..
```

### 3. Настрой конфиг

```bash
cp .env.example .env
nano .env
```

Заполни `.env`:

```env
# База данных PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/gw_registrar?schema=public"

# JWT секрет (придумай длинную строку)
JWT_SECRET="твой-супер-секретный-ключ-минимум-32-символа"

# Сервер
PORT=3000
HOST=0.0.0.0

# Логин/пароль админки (создастся при первом запуске)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=твой_пароль

# GoLogin - включить headless режим для сервера
GOLOGIN_HEADLESS=true
```

### 4. Создай базу данных

```bash
# Применить схему к базе
npx prisma db push

# Или через миграции
npx prisma migrate dev
```

### 5. Запусти

```bash
# Бэкенд (порт 3000)
npm run dev

# Фронтенд в отдельном терминале (порт 5173)
cd frontend
npm run dev
```

Админка будет на http://localhost:5173

---

## Настройка GoLogin (Fingerprint + Антидетект)

GoLogin нужен для создания уникальных браузерных профилей с разными fingerprint. Без него Google палит автоматизацию.

### Получение API ключа

1. Зарегайся на https://gologin.com
2. Купи подписку (минимум Professional для API)
3. Перейди в Settings -> API
4. Скопируй API Token

### Настройка в админке

1. Открой админку -> вкладка Settings
2. В секции GoLogin вставь API ключ
3. Headless режим:
   - `true` - для сервера/Docker (без GUI)
   - `false` - для локальной разработки (откроется браузер)

### Как работает

1. При создании аккаунта система создает новый профиль в GoLogin
2. Профиль получает уникальный fingerprint (canvas, webgl, fonts и тд)
3. Браузер запускается через этот профиль
4. После использования профиль удаляется (или сохраняется для повторного входа)

### Режимы работы

**SDK режим (рекомендуется):**
- Использует официальный пакет gologin
- Автоматически скачивает Orbita браузер
- Работает в headless режиме

**API режим (fallback):**
- Прямые HTTP запросы к GoLogin API
- Используется если SDK недоступен

---

## Настройка Proxy (Webshare)

Прокси нужны чтобы каждый аккаунт создавался с разного IP. Используем Webshare - там есть rotating прокси.

### Получение прокси

1. Зарегайся на https://webshare.io
2. Купи Rotating Proxy пакет
3. В Dashboard -> Proxy -> Settings найди:
   - Proxy Address: `p.webshare.io`
   - Port: `80` (HTTP) или `1080` (SOCKS5)
   - Username и Password

### Настройка в админке

1. Открой админку -> вкладка Settings
2. В секции Proxy заполни:
   - **Host**: `p.webshare.io`
   - **Port**: `80` для HTTP, `1080` для SOCKS5
   - **Username**: твой юзернейм из Webshare
   - **Password**: твой пароль из Webshare
   - **Protocol**: `http` или `socks5`

### Типы прокси

**Rotating (обычный):**
- Каждый запрос = новый IP
- Используется для Admin SDK запросов

**Sticky (липкий):**
- Один IP на всю сессию браузера
- Формат: `username-sessid-XXXXX:password`
- Система сама добавляет `-sessid-` к юзернейму

### Static Proxy для Workspace

Можно задать отдельный статический прокси для каждого Workspace:
1. Открой Workspaces -> редактирование
2. Заполни Static Proxy поля
3. Все Admin SDK запросы пойдут через этот прокси

---

## Настройка IMAP (Recovery Email)

IMAP нужен для получения OTP кодов которые Google отправляет на recovery email.

### Подготовка Gmail

1. Создай отдельный Gmail аккаунт для recovery
2. Включи двухфакторку (обязательно для App Password)
3. Создай App Password:
   - Google Account -> Security -> 2-Step Verification
   - App passwords -> Generate
   - Выбери "Mail" и "Other"
   - Скопируй 16-символьный пароль

4. Включи IMAP:
   - Gmail Settings -> See all settings
   - Forwarding and POP/IMAP
   - Enable IMAP

### Настройка в админке

1. Открой админку -> вкладка Recovery Emails
2. Добавь новый recovery email:
   - **Email**: твой Gmail для recovery
   - **IMAP Host**: `imap.gmail.com`
   - **IMAP Port**: `993`
   - **IMAP User**: тот же Gmail
   - **IMAP Password**: App Password (16 символов, без пробелов)
   - **Use SSL**: включено

3. Привяжи recovery email к Workspace:
   - Workspaces -> редактирование
   - Выбери Recovery Email из списка

### Как работает получение OTP

1. Система логинится в аккаунт Google
2. Google требует подтверждение через recovery email
3. Система ждет письмо на IMAP (до 2 минут)
4. Парсит OTP код из письма
5. Вводит код в браузере

---

## Настройка Google Workspace

### 1. Создай проект в Google Cloud

1. Открой https://console.cloud.google.com
2. Создай новый проект
3. Включи Admin SDK API:
   - APIs & Services -> Library
   - Найди "Admin SDK API"
   - Нажми Enable

### 2. Создай Service Account

1. IAM & Admin -> Service Accounts
2. Create Service Account
3. Дай имя (например `workspace-registrar`)
4. Пропусти роли (не нужны)
5. Создай ключ:
   - Keys -> Add Key -> Create new key
   - Выбери JSON
   - Скачай файл

### 3. Настрой Domain-Wide Delegation

1. Скопируй Client ID сервисного аккаунта (из JSON или из консоли)
2. Открой https://admin.google.com
3. Security -> Access and data control -> API controls
4. Domain-wide delegation -> Manage Domain Wide Delegation
5. Add new:
   - **Client ID**: вставь Client ID
   - **OAuth Scopes** (через запятую):
   ```
   https://www.googleapis.com/auth/admin.directory.user,https://www.googleapis.com/auth/admin.directory.user.security
   ```

### 4. Добавь Workspace в админку

1. Открой админку -> вкладка Workspaces
2. Add Workspace:
   - **Domain**: твой домен (например `company.com`)
   - **Admin Email**: email админа с правами создания юзеров
   - **Service Account JSON**: вставь содержимое JSON файла
   - **Default Password**: пароль для новых аккаунтов
3. Привяжи Recovery Email

---

## Структура проекта

```
├── src/
│   ├── index.js                 # Точка входа, Fastify сервер
│   ├── routes/
│   │   ├── auth.js              # Авторизация админки
│   │   ├── keys.js              # API ключи
│   │   ├── accounts.js          # Управление аккаунтами
│   │   ├── workspaces.js        # Google Workspace домены
│   │   ├── settings.js          # Настройки (GoLogin, Proxy)
│   │   ├── recoveryEmails.js    # Recovery email (IMAP)
│   │   ├── manual.js            # Ручное создание аккаунтов
│   │   ├── publicApi.js         # Публичный API для клиентов
│   │   ├── stats.js             # Статистика
│   │   ├── apiLogs.js           # Логи API запросов
│   │   └── creationLogs.js      # Логи создания аккаунтов
│   ├── services/
│   │   ├── googleWorkspace.js   # Google Admin SDK
│   │   ├── goLoginService.js    # GoLogin SDK/API
│   │   ├── fingerprintService.js # Fingerprint профили
│   │   ├── browserAutomation.js # Puppeteer автоматизация
│   │   ├── proxyService.js      # Webshare прокси
│   │   ├── stickyProxyServer.js # Локальный прокси сервер
│   │   ├── imapService.js       # IMAP для OTP
│   │   ├── accountCreationFull.js # Полный цикл создания
│   │   ├── accountCreation.js   # Упрощенное создание
│   │   └── queueService.js      # Bull очереди
│   └── utils/
│       ├── generators.js        # Генераторы ID
│       ├── init.js              # Инициализация БД
│       ├── rateLimiter.js       # Rate limiting
│       └── accountConfirmation.js # Автоподтверждение
├── frontend/
│   └── src/
│       ├── App.jsx              # Роутинг
│       ├── Login.jsx            # Страница входа
│       ├── GoogleWorkspaceAdmin.jsx # Основная админка
│       └── api.js               # API клиент
├── prisma/
│   └── schema.prisma            # Схема базы данных
├── .env.example                 # Пример конфига
├── docker-compose.yml           # Docker конфиг
└── Dockerfile
```

---

## API для клиентов

Клиенты получают аккаунты через API используя свой API ключ.

### Получить аккаунты

```bash
curl "http://localhost:3000/v1/accounts?count=5" \
  -H "X-API-Key: KEY-XXXXX-XX"
```

Ответ:
```json
{
  "success": true,
  "accounts": [
    {
      "email": "user123@domain.com",
      "password": "SecurePass123!",
      "recovery": "recovery@gmail.com"
    }
  ],
  "count": 1,
  "quota": {
    "used": 15,
    "limit": 100,
    "remaining": 85
  }
}
```

### Проверить квоту

```bash
curl "http://localhost:3000/v1/quota" \
  -H "X-API-Key: KEY-XXXXX-XX"
```

### Пожаловаться на аккаунт

Если аккаунт не работает, клиент может пожаловаться в течение 15 минут:

```bash
curl -X POST "http://localhost:3000/v1/accounts/report" \
  -H "X-API-Key: KEY-XXXXX-XX" \
  -H "Content-Type: application/json" \
  -d '{"email": "user123@domain.com"}'
```

### История аккаунтов

```bash
curl "http://localhost:3000/v1/accounts/history" \
  -H "X-API-Key: KEY-XXXXX-XX"
```

---

## Docker

### Быстрый запуск через Docker Compose

```bash
# Запустить все (postgres, redis, backend, frontend)
docker-compose up -d

# Посмотреть логи
docker-compose logs -f backend
```

### Только база данных

```bash
# Запустить только PostgreSQL
docker-compose up -d postgres

# Подключиться
psql postgresql://gwadmin:gwpassword123@localhost:5432/gw_registrar
```

---

## Процесс создания аккаунта

Полный цикл создания (7 шагов):

1. **Get Proxy** - Получить прокси из Webshare (rotating или sticky)
2. **Create via Admin SDK** - Создать аккаунт через Google Admin API
3. **Create GoLogin Profile** - Создать браузерный профиль с fingerprint
4. **Browser Login** - Залогиниться в аккаунт через браузер
5. **Add Recovery Email** - Добавить recovery email в настройках аккаунта
6. **Get OTP** - Получить OTP код через IMAP
7. **Confirm OTP** - Ввести OTP в браузере

Каждый шаг логируется в Creation Logs.

---

## Статусы аккаунтов

- **AVAILABLE** - Готов к выдаче
- **ISSUED** - Выдан клиенту (ждет подтверждения 15 минут)
- **BAD** - Не работает (клиент пожаловался)

---

## Troubleshooting

### GoLogin не запускается

```
Error: GoLogin SDK not available
```

Решение:
- Проверь что установлен пакет `gologin`
- Для Docker используй `GOLOGIN_HEADLESS=true`
- Проверь API ключ в Settings

### Прокси не работает

```
Error: Proxy authentication failed
```

Решение:
- Проверь username/password в Settings
- Попробуй другой порт (80 vs 1080)
- Проверь баланс на Webshare

### IMAP не получает письма

```
Error: OTP timeout
```

Решение:
- Проверь App Password (должен быть 16 символов без пробелов)
- Убедись что IMAP включен в Gmail
- Проверь что recovery email привязан к Workspace

### Google требует телефон

```
Error: Phone verification required
```

Это значит Google заподозрил автоматизацию. Решения:
- Используй GoLogin с хорошим fingerprint
- Используй residential прокси
- Подожди 24+ часа перед логином в новый аккаунт
- Используй внешний Gmail (не из того же домена) как recovery

---

## Лицензия

MIT
