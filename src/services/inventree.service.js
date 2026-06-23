import inventree from '../config/inventree.js';

// =============================================================================
// Servicio de InvenTree (base maestra de inventario).
// Fase 1: solo lectura. Las funciones de escritura (estado/ubicación) se usarán
// cuando se implemente el flujo de aceptar/devolver préstamos.
// =============================================================================

/**
 * Lista stock items con detalle de parte y ubicación.
 * @param {object} params - filtros opcionales (search, location, part, limit, offset, ordering)
 */
export async function listarStock(params = {}) {
  const { data } = await inventree.get('/stock/', {
    params: { part_detail: true, location_detail: true, ...params },
  });
  return data; // { count, next, previous, results: [...] }
}

/** Obtiene un stock item por su pk. */
export async function getStockItem(pk) {
  const { data } = await inventree.get(`/stock/${pk}/`, {
    params: { part_detail: true, location_detail: true },
  });
  return data;
}

/** Lista ubicaciones de stock. */
export async function listarUbicaciones(params = {}) {
  const { data } = await inventree.get('/stock/location/', { params });
  return data;
}

/** Lista partes (catálogo). */
export async function listarPartes(params = {}) {
  const { data } = await inventree.get('/part/', { params });
  return data;
}

/** Info/health del servidor InvenTree (sin auth requerida, pero reusa el cliente). */
export async function infoServidor() {
  const { data } = await inventree.get('/');
  return data;
}

// --- Escritura (se usará en el flujo de préstamos, Fase 3) -------------------

/** Cambia el estado (status code) de un stock item. */
export async function setEstado(pk, statusKey) {
  const { data } = await inventree.patch(`/stock/${pk}/`, { status: statusKey });
  return data;
}

/**
 * Devuelve un mapa { pk: stockItem } para varios items, en paralelo.
 * Sirve para enriquecer una lista de préstamos con datos en vivo de InvenTree.
 * Si un item falla (p.ej. fue borrado), queda como null en el mapa.
 */
export async function getStockItemsMap(ids = []) {
  const unicos = [...new Set(ids)].filter((x) => x != null);
  const entradas = await Promise.all(
    unicos.map(async (pk) => {
      try {
        return [pk, await getStockItem(pk)];
      } catch {
        return [pk, null];
      }
    }),
  );
  return Object.fromEntries(entradas);
}

/** Mueve un stock item a otra ubicación. */
export async function moverUbicacion(pk, locationId) {
  const { data } = await inventree.patch(`/stock/${pk}/`, { location: locationId });
  return data;
}
