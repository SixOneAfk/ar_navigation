# Progress Report: NAV_AR Repository Audit

This report provides a detailed overview of the current state of the NAV_AR repository as of 2026-08-03.

## 1. Реализованные модули (Implemented Modules)

### Frontend (PWA / Sensors)
- **Технологии:** React, Vite, Three.js (@react-three/fiber).
- **Сенсоры:**
    - [`useGyroscope.ts`](apps/client/src/hooks/useGyroscope.ts): Реализован захват ориентации устройства (`alpha`, `beta`, `gamma`). Поддерживает запрос разрешений для iOS/Android.
    - [`useAcceleration.ts`](apps/client/src/hooks/useAcceleration.ts): Реализован алгоритм PDR (Pedestrian Dead Reckoning). Включает:
        - Фильтрацию шума (Deadband).
        - Выделение вертикального ускорения для подсчета шагов.
        - Интегрирование ускорения для оценки скорости и позиции (на базовом уровне).
- **Компоненты:**
    - [`ModelScene.tsx`](apps/client/src/components/ModelScene.tsx): Рендеринг 3D-сцены с использованием `Three.js`.
    - [`GyroCamera.tsx`](apps/client/src/components/GyroCamera.tsx): Синхронизация камеры в 3D с датчиками устройства.

### Backend (Spatial Graph & Positioning)
- **Технологии:** NestJS, gRPC.
- **Модули:**
    - [`GraphService`](apps/core-backend/src/modules/graph/graph.service.ts): Реализован 3D граф узлов/ребер, JSON-схемы `node/edge`, A* pathfinding с учетом переходов между этажами.
    - [`TrilaterationService`](apps/core-backend/src/modules/trilateration/trilateration.service.ts): **Заглушка**. Содержит метод `estimatePositionFromRssi`, возвращающий `{ status: 'todo' }`.
    - [`PositioningGrpcController`](apps/core-backend/src/modules/positioning/positioning.grpc.controller.ts): gRPC-сервер, принимающий телеметрию.

### OCR/CV Service
- **Технологии:** Python, FastAPI.
- **Статус:** [`main.py`](apps/cv-service/main.py) реализует OCR recalibration pipeline: decode base64 кадра, OpenCV pre-processing, OCR (EasyOCR/PyTesseract fallback), fuzzy matching к node-id, endpoint `/api/v1/recalibrate`.

### API Gateway
- **Технологии:** NestJS.
- **Контроллеры:**
    - [`PositionController`](apps/gateway/src/modules/position/position.controller.ts): Проксирует телеметрию с фронтенда в `core-backend` через gRPC и проксирует маршрутные запросы в `core-backend` HTTP `/api/v1/route`.
    - [`CvController`](apps/gateway/src/modules/cv/cv.controller.ts): Нормализует payload и форвардит OCR-запросы в Python CV service `/api/v1/recalibrate`.
    - [`WifiController`](apps/gateway/src/modules/wifi/wifi.controller.ts): Принимает данные об уровне сигнала WiFi.

---

## 2. Тестовое покрытие (Test Coverage)

### Существующие тесты
- **Gateway:**
    - Модульные тесты: `apps/gateway/src/app.controller.spec.ts`.
    - E2E тесты: `apps/gateway/test/app.e2e-spec.ts`.
- **Core Backend:**
    - Модульные тесты: `apps/core-backend/src/app.controller.spec.ts`.
    - E2E тесты: `apps/core-backend/test/app.e2e-spec.ts`.

### Команды для запуска
- **Node.js (Gateway & Core):**
    - `npm test` (в папке приложения) — запуск модульных тестов через `jest`.
    - `npm run test:e2e` — запуск E2E тестов.
- **Frontend:** Тесты отсутствуют.
- **CV Service:** Тесты отсутствуют.

---

## 3. Документация (Documentation)

- **Root Docs:**
    - [`README.md`](README.md): Описание структуры монорепозитория и портов.
    - [`QUICK_START.md`](QUICK_START.md): Инструкция по запуску.
    - [`AGENTS.md`](agents.md): Описание ролей AI-агентов, бюджета проекта и контракта данных.
- **Code Documentation:**
    - Присутствуют JSDoc комментарии в некоторых хуках фронтенда (напр. в `useGyroscope.ts`).
    - В контроллерах бэкенда активно используется логирование для отслеживания потока данных.

---

## 4. Интеграции (Integrations)

| Связь | Тип | Статус |
|-------|-----|--------|
| Frontend -> Gateway | HTTP REST | **Функционирует** (Telemetry ingest) |
| Gateway -> Core Backend | gRPC + HTTP REST | **Функционирует** (telemetry по gRPC и route forward в HTTP API) |
| Gateway -> CV Service | HTTP REST | **Функционирует** (gateway форвардит `/api/v1/cv/scan` в CV recalibrate API) |
| Core Backend -> Spatial Graph | Internal + HTTP REST | **Функционирует** (A* в `GraphService` и внешний endpoint `/api/v1/route`) |

---

## Итог аудита
Проект имеет рабочий каркас и частично реализованную бизнес-логику (Graph Navigation + OCR recalibration + API forwarding). Основные пробелы: trilateration и полноценная end-to-end валидация PDR+OCR fusion на полевых данных.
