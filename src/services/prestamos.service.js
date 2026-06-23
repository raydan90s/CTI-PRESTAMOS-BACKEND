import supabase from '../config/supabase.js';
import { getStockItem, getStockItemsMap, setEstado } from './inventree.service.js';

const STATUS_PRESTADO = Number(process.env.INVENTREE_STATUS_PRESTADO ?? 91);
const STATUS_DISPONIBLE = Number(process.env.INVENTREE_STATUS_DISPONIBLE ?? 10);

// Estados que "ocupan" un item (no se puede volver a solicitar mientras tanto).
const ESTADOS_ACTIVOS = ['pendiente', 'aceptado'];

export class PrestamoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Registra un evento de auditoría (best-effort, no rompe el flujo si falla). */
async function registrarEvento(prestamo_id, estado, actor_id, detalle) {
  await supabase.from('prestamo_eventos').insert({ prestamo_id, estado, actor_id, detalle });
}

/**
 * Crea una solicitud de préstamo (estado 'pendiente').
 * Valida que el item exista en InvenTree y que no tenga ya un préstamo activo.
 */
export async function crearPrestamo({ usuario_id, stock_item_id, motivo }) {
  stock_item_id = Number(stock_item_id);
  if (!Number.isInteger(stock_item_id)) throw new PrestamoError('stock_item_id inválido');

  // 1) El item debe existir en InvenTree.
  let item;
  try {
    item = await getStockItem(stock_item_id);
  } catch {
    throw new PrestamoError('El item no existe en InvenTree', 404);
  }

  // 2) No debe tener ya un préstamo activo (pendiente o aceptado).
  const { data: activos, error: e1 } = await supabase
    .from('prestamos')
    .select('id, estado')
    .eq('stock_item_id', stock_item_id)
    .in('estado', ESTADOS_ACTIVOS);
  if (e1) throw new PrestamoError('Error consultando préstamos', 502);
  if (activos?.length) throw new PrestamoError('El item ya tiene una solicitud o préstamo activo', 409);

  // 3) Crear.
  const { data, error } = await supabase
    .from('prestamos')
    .insert({ stock_item_id, usuario_id, motivo: motivo ?? null, estado: 'pendiente' })
    .select()
    .single();
  if (error) throw new PrestamoError('No se pudo crear el préstamo', 502);

  await registrarEvento(data.id, 'pendiente', usuario_id, motivo ?? null);
  return { ...data, item };
}

/**
 * Lista préstamos. Un 'gestor' ve todos; un 'solicitante' solo los suyos.
 * Enriquecidos con datos en vivo del item desde InvenTree.
 */
export async function listarPrestamos({ user, estado }) {
  let query = supabase
    .from('prestamos')
    .select('*')
    .order('fecha_solicitud', { ascending: false });

  if (estado) query = query.eq('estado', estado);
  if (user.rol !== 'gestor') query = query.eq('usuario_id', user.id);

  const { data: prestamos, error } = await query;
  if (error) throw new PrestamoError('Error consultando préstamos', 502);

  const mapa = await getStockItemsMap(prestamos.map((p) => p.stock_item_id));
  return prestamos.map((p) => ({ ...p, item: mapa[p.stock_item_id] ?? null }));
}

/** Obtiene un préstamo por id, validando permisos. */
export async function getPrestamo(id, user) {
  const { data: prestamo, error } = await supabase
    .from('prestamos').select('*').eq('id', id).maybeSingle();
  if (error) throw new PrestamoError('Error consultando el préstamo', 502);
  if (!prestamo) throw new PrestamoError('Préstamo no encontrado', 404);
  if (user.rol !== 'gestor' && prestamo.usuario_id !== user.id) {
    throw new PrestamoError('No tienes acceso a este préstamo', 403);
  }

  let item = null;
  try { item = await getStockItem(prestamo.stock_item_id); } catch { /* item ausente */ }
  return { ...prestamo, item };
}

/** Carga un préstamo y exige que esté en un estado concreto. */
async function cargarEnEstado(id, estadoEsperado) {
  const { data: prestamo, error } = await supabase
    .from('prestamos').select('*').eq('id', id).maybeSingle();
  if (error) throw new PrestamoError('Error consultando el préstamo', 502);
  if (!prestamo) throw new PrestamoError('Préstamo no encontrado', 404);
  if (prestamo.estado !== estadoEsperado) {
    throw new PrestamoError(`El préstamo está '${prestamo.estado}', no se puede aplicar esta acción`, 409);
  }
  return prestamo;
}

/**
 * Aceptar (solo gestor): marca 'aceptado' en Supabase Y pone el item como
 * "Prestado" en InvenTree. Si InvenTree falla, NO confirma (revierte en Supabase).
 */
export async function aceptarPrestamo(id, gestor_id, observacion) {
  const prestamo = await cargarEnEstado(id, 'pendiente');

  // 1) Reflejar en InvenTree primero (es lo que puede fallar).
  try {
    await setEstado(prestamo.stock_item_id, STATUS_PRESTADO);
  } catch {
    throw new PrestamoError('No se pudo actualizar el estado en InvenTree (¿VPN / estado custom creado?)', 502);
  }

  // 2) Confirmar en Supabase.
  const { data, error } = await supabase
    .from('prestamos')
    .update({ estado: 'aceptado', resuelto_por: gestor_id, observacion: observacion ?? null, fecha_resolucion: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // Revertir el estado en InvenTree para no dejar inconsistencia.
    try { await setEstado(prestamo.stock_item_id, STATUS_DISPONIBLE); } catch { /* best-effort */ }
    throw new PrestamoError('No se pudo confirmar el préstamo', 502);
  }

  await registrarEvento(id, 'aceptado', gestor_id, observacion ?? null);
  return data;
}

/** Rechazar (solo gestor): marca 'rechazado'. No toca InvenTree. */
export async function rechazarPrestamo(id, gestor_id, observacion) {
  await cargarEnEstado(id, 'pendiente');

  const { data, error } = await supabase
    .from('prestamos')
    .update({ estado: 'rechazado', resuelto_por: gestor_id, observacion: observacion ?? null, fecha_resolucion: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new PrestamoError('No se pudo rechazar el préstamo', 502);

  await registrarEvento(id, 'rechazado', gestor_id, observacion ?? null);
  return data;
}

/**
 * Devolver (solo gestor): marca 'devuelto' Y regresa el item a DISPONIBLE en InvenTree.
 */
export async function devolverPrestamo(id, gestor_id) {
  const prestamo = await cargarEnEstado(id, 'aceptado');

  try {
    await setEstado(prestamo.stock_item_id, STATUS_DISPONIBLE);
  } catch {
    throw new PrestamoError('No se pudo actualizar el estado en InvenTree (¿VPN?)', 502);
  }

  const { data, error } = await supabase
    .from('prestamos')
    .update({ estado: 'devuelto', fecha_devolucion: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new PrestamoError('No se pudo registrar la devolución', 502);

  await registrarEvento(id, 'devuelto', gestor_id, null);
  return data;
}
