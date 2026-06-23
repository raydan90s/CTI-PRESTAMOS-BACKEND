-- =============================================================================
-- CTI-PRESTAMOS — Esquema de la base de datos propia (Supabase / PostgreSQL)
-- =============================================================================
-- Principio: NO se duplica el inventario (partes, stock, ubicaciones, estado
-- físico) que vive en InvenTree. Supabase solo guarda lo que InvenTree no tiene:
-- los usuarios propios y el flujo de préstamos. Los items se referencian por su
-- `pk` de InvenTree (stock_item_id); su nombre/ubicación/estado se leen en vivo.
--
-- Ejecutar en: Supabase → SQL Editor (o psql con DATABASE_URL).
-- =============================================================================

-- Tipos enumerados ------------------------------------------------------------
create type rol_usuario     as enum ('solicitante', 'gestor');
create type estado_prestamo as enum ('pendiente', 'aceptado', 'rechazado', 'devuelto');

-- Usuarios propios (login gestionado por el backend, no por InvenTree) --------
create table usuarios (
  id             uuid primary key default gen_random_uuid(),
  email          text unique not null,
  password_hash  text not null,
  nombre         text not null,
  rol            rol_usuario not null default 'solicitante',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

-- Préstamos -------------------------------------------------------------------
-- El item se referencia por su pk en InvenTree (stock_item_id); NO se copia.
create table prestamos (
  id                uuid primary key default gen_random_uuid(),
  stock_item_id     integer not null,               -- pk del StockItem en InvenTree
  usuario_id        uuid not null references usuarios(id),
  estado            estado_prestamo not null default 'pendiente',
  motivo            text,                            -- por qué lo pide el solicitante
  observacion       text,                            -- nota del gestor al resolver
  resuelto_por      uuid references usuarios(id),    -- gestor que aceptó/rechazó
  fecha_solicitud   timestamptz not null default now(),
  fecha_resolucion  timestamptz,                     -- cuándo se aceptó/rechazó
  fecha_devolucion  timestamptz                      -- cuándo se devolvió
);

create index idx_prestamos_estado  on prestamos (estado);
create index idx_prestamos_usuario on prestamos (usuario_id);
create index idx_prestamos_item    on prestamos (stock_item_id);

-- Auditoría de cambios de estado (opcional pero recomendado) ------------------
create table prestamo_eventos (
  id           uuid primary key default gen_random_uuid(),
  prestamo_id  uuid not null references prestamos(id) on delete cascade,
  estado       estado_prestamo not null,
  actor_id     uuid references usuarios(id),
  detalle      text,
  creado_en    timestamptz not null default now()
);

create index idx_prestamo_eventos_prestamo on prestamo_eventos (prestamo_id);

-- =============================================================================
-- Notas
-- - La autorización la hace el backend (Express) con los roles de `usuarios`,
--   conectándose con credenciales de servicio. Por eso NO se definen políticas
--   RLS aquí. Si el frontend pegara directo a Supabase, habría que añadir RLS.
-- - "¿el item está libre?" se deriva: existe un préstamo 'aceptado' sin
--   fecha_devolucion para ese stock_item_id, cruzado con el estado en InvenTree.
-- - Snapshot histórico opcional: si se quiere conservar nombre/serial del item
--   al momento del préstamo (aunque InvenTree cambie después), añadir a
--   `prestamos` una columna `item_snapshot jsonb` (solo informativa, no la verdad).
-- =============================================================================
