# CTI-PRESTAMOS — Backend

Backend del **sistema de gestión de préstamos** que se construye sobre un servidor InvenTree de ESPOL.
Este repo es la API propia; el inventario real vive en InvenTree (ver más abajo).

## Stack

- Node.js (ESM, `"type":"module"`) + Express.
- Dependencias: `express`, `cors`, `morgan`, `axios`, `@supabase/supabase-js`, `dotenv` (también `pg`, ya en desuso).
- Base de datos propia: **Supabase**, accedida por su **API HTTPS (puerto 443)** con `@supabase/supabase-js`.

> ⚠️ **IMPORTANTE (red):** la VPN de ESPOL **bloquea el puerto Postgres 5432** (y 6543), pero deja pasar
> el 443. Como el backend DEBE estar en la VPN para alcanzar InvenTree, NO se puede usar conexión directa
> `pg` a Supabase desde ahí. Por eso se usa `supabase-js` sobre 443. Diagnóstico confirmado: `google:443`
> e `inventree:443` abiertos, `supabase:5432/6543` timeout, `supabase REST:443` HTTP 200 con la secret key.

## Estructura

```
src/
  server.js                       # entrada: carga dotenv/config y levanta el server (PORT 3000)
  app.js                          # base Express + monta /api/v1 + errorHandler
  config/
    supabase.js                   # cliente @supabase/supabase-js (HTTPS 443, secret key)
    db.js                         # pool de pg — EN DESUSO (5432 bloqueado por la VPN)
    inventree.js                  # cliente axios a InvenTree (token + cert self-signed)
  services/
    inventree.service.js          # funciones de InvenTree (listar/get/setEstado/getStockItemsMap)
    auth.service.js               # registrar/login/obtenerPorId + firmarToken (bcrypt + JWT)
    prestamos.service.js          # crear/listar/get/aceptar/rechazar/devolver
  routes/
    inventario.routes.js          # endpoints solo-lectura de inventario
    auth.routes.js                # /auth/registro, /auth/login, /auth/me
    prestamos.routes.js           # CRUD préstamos + acciones de gestor
  middlewares/
    auth.js                       # verifyToken + requireRol(...roles)
    errorHandler.js               # traduce errores de axios/InvenTree a respuestas limpias
db/
  schema.sql                      # esquema de la BD propia (correr en Supabase SQL Editor)
.env                              # PORT, DATABASE_URL, INVENTREE_* — IGNORADO por git
.env.example                      # plantilla sin secretos
```

## Endpoints disponibles (Fase 1 — solo lectura, listos)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | health: verifica conectividad con Supabase (API 443) → `{ok, supabase, tablas_creadas}` |
| GET | `/api/v1/inventario` | lista stock items en vivo desde InvenTree (query: `search`, `location`, `part`, `limit`, `offset`, `ordering`) |
| GET | `/api/v1/inventario/:id` | un stock item (con part_detail y location_detail) |
| GET | `/api/v1/ubicaciones` | ubicaciones de stock (query: `search`, `limit`, `offset`) |
| GET | `/api/v1/partes` | catálogo de partes (query: `search`, `category`, `limit`, `offset`) |
| POST | `/api/v1/auth/registro` | crea usuario (siempre rol `solicitante`) → `{ usuario, token }` |
| POST | `/api/v1/auth/login` | valida credenciales → `{ usuario, token }` |
| GET | `/api/v1/auth/me` | datos del usuario autenticado (requiere `Authorization: Bearer <token>`) |
| POST | `/api/v1/prestamos` | crea solicitud `pendiente` (auth; valida item en InvenTree y que no tenga préstamo activo) |
| GET | `/api/v1/prestamos` | lista (gestor: todos; solicitante: propios); `?estado=`; enriquecido con item de InvenTree |
| GET | `/api/v1/prestamos/:id` | detalle (con permisos) |
| PATCH | `/api/v1/prestamos/:id/aceptar` | **gestor**: `aceptado` + item→"Prestado" en InvenTree |
| PATCH | `/api/v1/prestamos/:id/rechazar` | **gestor**: `rechazado` (no toca InvenTree) |
| PATCH | `/api/v1/prestamos/:id/devolver` | **gestor**: `devuelto` + item→disponible en InvenTree |

Inventario requiere estar en la VPN/red ESPOL (si no, 504 con mensaje claro). Auth usa Supabase (443).

### Auth — notas
- Hash con `bcryptjs`, sesión con **JWT** (`JWT_SECRET`, `JWT_EXPIRES_IN` en `.env`). Payload: `{ sub, email, rol }`.
- Proteger rutas: `verifyToken` (deja `req.user = {id,email,rol}`) y `requireRol('gestor')`.
- `registro` siempre crea `solicitante`. Para crear un **gestor**: en Supabase SQL Editor
  `update usuarios set rol='gestor' where email='...';` (o promover desde un futuro panel admin).

> Estado actual: el backend está reducido a **la base + conexión a BD**. `app.js` antes importaba
> rutas/middlewares (`auth`, `rutas`, `mensajes`, `admin`, `user`, `vehicles`, `bookings`,
> `errorHandler`) que **no existían como archivos** y rompían el arranque; se quitaron.

## Comandos

```bash
npm install
npm run dev    # node --watch src/server.js
npm start      # node src/server.js
```

## Configuración (.env)

```
PORT=3000
SUPABASE_URL=https://TU-PROJECT-ID.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxx          # key de servidor (se salta RLS), va sobre 443
DATABASE_URL=postgresql://...:5432/postgres # opcional; solo funciona FUERA de la VPN
INVENTREE_URL=https://inventree.cti.espol.edu.ec
INVENTREE_TOKEN=inv-xxxx
```
La BD es **Supabase**, accedida por `supabase-js` sobre HTTPS/443 (ver nota de red arriba).
Credenciales reales solo en `.env` local, nunca en el repo. Keys nuevas de Supabase:
`sb_publishable_…` (pública, para frontend si pegara directo) y `sb_secret_…` (servidor, la que usa el backend).

## Integración con InvenTree (servidor de ESPOL)

InvenTree es la **base maestra de inventario** (qué existe, cuánto, dónde está, estado). Este backend
solo guarda el **flujo de préstamos** y refleja los cambios en InvenTree vía su API REST.

- API: `https://inventree.cti.espol.edu.ec/api/` — Swagger `/api/swagger/`, Redoc `/api/redoc/`.
- IP 200.10.150.33. Cert interno/self-signed → usar `rejectUnauthorized:false`.
- **Solo accesible dentro de la red ESPOL (VPN).** El backend debe correr con ese acceso.
- Versión InvenTree **1.3.2** (apiVersion 477). Stack Docker en `/data/inventree-app`.
- Auth: `GET /api/user/token/` con Basic Auth → token; luego header `Authorization: Token <token>`.
  El token/credenciales van al `.env`, no al repo.
- Datos (2026-06): 259 partes, 358 stock items, 100 ubicaciones.
- StockItem expone: `location`, `customer`, `status`/`status_custom_key`, `notes`, `link`.
  Estados nativos: OK(10), ATTENTION(50), DAMAGED(55), REJECTED(65), LOST(70), QUARANTINED(75), RETURNED(85).
  Soporta **custom status codes**.

## Modelo de datos (Supabase) — ver `db/schema.sql`

Principio: **no se duplica el inventario** de InvenTree. Supabase guarda solo lo que InvenTree no tiene:
usuarios propios y el flujo de préstamos. Los items se referencian por su `pk` de InvenTree
(`stock_item_id`); nombre/ubicación/estado se leen en vivo de InvenTree.

- `usuarios` — login propio (email, password_hash, `rol` solicitante/gestor, activo).
- `prestamos` — `stock_item_id` (pk InvenTree), `usuario_id`, `estado` (pendiente/aceptado/rechazado/devuelto),
  `motivo`, `observacion`, `resuelto_por`, `fecha_solicitud/resolucion/devolucion`.
- `prestamo_eventos` (opcional) — auditoría de cambios de estado.

Notas: la autorización la hace el backend con los roles (conexión de servicio), por eso **no se usa RLS**.
"¿item libre?" se deriva de un préstamo `aceptado` sin `fecha_devolucion` cruzado con el estado en InvenTree.
Esquema ejecutable completo en [db/schema.sql](db/schema.sql).

## Decisiones de diseño (2026-06-23)

- **Login**: usuarios PROPIOS en Supabase (no se reusan cuentas de InvenTree). Roles: solicitante / gestor.
- **Estado "prestado"**: se refleja en InvenTree con un **status code CUSTOM "Prestado"** (el item conserva su ubicación).
- Al **aceptar**: marca `aceptado` en Supabase + setea estado "Prestado" en InvenTree (si falla InvenTree, no confirma).
  Al **rechazar**: solo Supabase. Al **devolver**: `devuelto` en Supabase + estado vuelve a OK en InvenTree.

## Plan de implementación (pendiente — el usuario pidió solo planificar por ahora)

1. **Fase 0** (en InvenTree, una vez): crear estado custom "Prestado"; crear token de servicio con permisos mínimos.
2. **Fase 1** ✅ HECHA: cliente axios a InvenTree + endpoints solo-lectura (`/api/v1/inventario`, `/inventario/:id`, `/ubicaciones`, `/partes`). Probado en vivo contra ESPOL.
3. **Fase 2** ✅ HECHA: BD Supabase (tablas creadas, conectividad 443) + auth (registro/login JWT + bcrypt, `/auth/me`) + middlewares `verifyToken`/`requireRol`. Flujo probado en vivo (registro→login→me, 401/409 correctos).
4. **Fase 3** ✅ HECHA (backend): `prestamos.service.js` + `prestamos.routes.js`. Probado: crear/listar/detalle/rechazar + permisos (403/409/404). Fase 0 (estado custom "Prestado" key 91) ✅ creada → `aceptar`/`devolver` ya pueden escribir en InvenTree.
5. **Fase 4**: lo consume el frontend (repo aparte CTI-PRESTAMOS-FRONTEND). Inventario ✅; faltan login, solicitar, pendientes (aceptar/rechazar).

## Fase 0 — estado custom "Prestado" en InvenTree ✅ HECHA (2026-06-23)

Creado el estado custom "Prestado" en InvenTree (autorizado por el usuario):
`POST /api/generic/status/custom/` con `{key:91, name:"PRESTADO", label:"Prestado", color:"primary",
logical_key:10, reference_status:"StockStatus", model:63}` (63 = ContentType de `stockitem`, vía
`/api/contenttype/`). Ojo: el campo `model` es un pk de ContentType (obligatorio), no `model_name`.
Ya aparece como key 91 en `/api/stock/status/`. `INVENTREE_STATUS_PRESTADO=91` lo referencia.

## Notas

- La "verdad" del inventario es InvenTree; Supabase solo guarda el workflow. Re-validar contra InvenTree al aceptar.
- Frontend en repo separado: `d:\GitHub\CTI-PRESTAMOS-FRONTEND` (React 19 + Vite + TS + Tailwind).
