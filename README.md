# Google Workspace Account Registrar

Backend API для панели управления созданием Google Workspace аккаунтов.

## Возможности

- 🔑 Управление API ключами с квотами
- 👤 Создание Google Workspace аккаунтов через Admin SDK
- 🏢 Поддержка нескольких Workspace доменов
- 📧 Автоматическая установка recovery email
- 📊 Статистика и логирование API запросов
- 🔐 JWT авторизация для админ-панели
- 📥 Экспорт аккаунтов в TXT/JSON

## Требования

- Node.js 18+
- PostgreSQL 14+
- Google Workspace с настроенным Admin SDK

## Установка

```bash
# Клонировать репозиторий
git clone <repository>
cd google-workspace-registrar

# Установить зависимости
npm install

# Скопировать конфиг
cp .env.example .env

# Настроить .env файл
nano .env

# Применить миграции БД
npm run db:push

# Запустить сервер
npm run dev
```

## Настройка Google Workspace

### 1. Создание проекта в Google Cloud Console

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект
3. Включите **Admin SDK API**:
   - APIs & Services → Library
   - Найдите "Admin SDK API"
   - Нажмите Enable

### 2. Создание Service Account

1. IAM & Admin → Service Accounts
2. Create Service Account
3. Дайте имя (например, `workspace-registrar`)
4. Создайте ключ в формате JSON
5. Сохраните JSON файл

### 3. Настройка Domain-Wide Delegation

1. Скопируйте Client ID сервисного аккаунта
2. Перейдите в [Google Admin Console](https://admin.google.com/)
3. Security → Access and data control → API controls
4. Domain-wide delegation → Manage Domain Wide Delegation
5. Add new:
   - Client ID: (вставьте Client ID)
   - OAuth Scopes:
     ```
     https://www.googleapis.com/auth/admin.directory.user
     https://www.googleapis.com/auth/admin.directory.user.security
     ```

### 4. Добавление Workspace в панель

В панели управления добавьте Workspace:
- **Domain**: ваш домен Google Workspace
- **Admin Email**: email администратора с правами управления пользователями
- **Service Account JSON**: содержимое JSON файла ключа

## API Endpoints

### Админ API (требует JWT)

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/auth/login` | Авторизация |
| GET | `/api/keys` | Список ключей |
| POST | `/api/keys` | Создать ключ |
| GET | `/api/accounts` | Список аккаунтов |
| GET | `/api/workspaces` | Список Workspace |
| POST | `/api/manual/create` | Ручное создание аккаунтов |
| GET | `/api/stats` | Статистика |

### Публичный API (по API ключу)

| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/v1/accounts?count=N` | Получить N аккаунтов |
| POST | `/v1/accounts/create` | Создать новые аккаунты |
| GET | `/v1/quota` | Проверить квоту |
| POST | `/v1/accounts/report` | Отметить аккаунт как BAD |

### Примеры запросов

#### Авторизация
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

#### Получение аккаунтов (клиентский API)
```bash
curl http://localhost:3000/v1/accounts?count=5 \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Проверка квоты
```bash
curl http://localhost:3000/v1/quota \
  -H "X-API-Key: YOUR_API_KEY"
```

## Структура проекта

```
├── prisma/
│   └── schema.prisma      # Схема базы данных
├── src/
│   ├── index.js           # Точка входа
│   ├── routes/
│   │   ├── auth.js        # Авторизация
│   │   ├── keys.js        # Управление ключами
│   │   ├── accounts.js    # Управление аккаунтами
│   │   ├── workspaces.js  # Управление Workspace
│   │   ├── settings.js    # Настройки
│   │   ├── apiLogs.js     # Логи API
│   │   ├── manual.js      # Ручное создание
│   │   ├── publicApi.js   # Публичный API
│   │   └── stats.js       # Статистика
│   ├── services/
│   │   ├── googleWorkspace.js  # Google Admin SDK
│   │   └── accountCreation.js  # Сервис создания
│   └── utils/
│       ├── generators.js  # Генераторы ID
│       └── init.js        # Инициализация
├── .env.example
├── package.json
└── README.md
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| DATABASE_URL | PostgreSQL connection string | - |
| JWT_SECRET | Секрет для JWT токенов | - |
| PORT | Порт сервера | 3000 |
| HOST | Хост сервера | 0.0.0.0 |
| ADMIN_USERNAME | Логин админа | admin |
| ADMIN_PASSWORD | Пароль админа | admin123 |

## Формат данных

### Экспорт аккаунтов (TXT)
```
email:password:recovery
user123@domain.com:Password123:recovery@gmail.com
```

### Экспорт логов (JSON)
```json
[
  {
    "ts": "2024-01-25T12:00:00Z",
    "endpoint": "/v1/accounts",
    "keyId": "KEY-12345-A1",
    "status": 200,
    "latencyMs": 150
  }
]
```

## Безопасность

- Все пароли хешируются через bcrypt
- API ключи генерируются криптографически безопасно
- JWT токены истекают через 24 часа
- Sensitive данные маскируются в API ответах

## Лицензия

MIT
