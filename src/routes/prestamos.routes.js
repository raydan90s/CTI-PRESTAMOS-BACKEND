import { Router } from 'express';
import {
  crearPrestamo,
  listarPrestamos,
  getPrestamo,
  aceptarPrestamo,
  rechazarPrestamo,
  devolverPrestamo,
  PrestamoError,
} from '../services/prestamos.service.js';
import { verifyToken, requireRol } from '../middlewares/auth.js';

const router = Router();

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof PrestamoError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// Todas las rutas requieren autenticación.
router.use(verifyToken);

// POST /api/v1/prestamos  -> crear solicitud (cualquier usuario autenticado)
router.post('/', handle(async (req, res) => {
  const { stock_item_id, motivo } = req.body;
  const prestamo = await crearPrestamo({ usuario_id: req.user.id, stock_item_id, motivo });
  res.status(201).json(prestamo);
}));

// GET /api/v1/prestamos?estado=pendiente  -> lista (gestor: todos; solicitante: propios)
router.get('/', handle(async (req, res) => {
  const data = await listarPrestamos({ user: req.user, estado: req.query.estado });
  res.json({ count: data.length, results: data });
}));

// GET /api/v1/prestamos/:id  -> detalle
router.get('/:id', handle(async (req, res) => {
  const prestamo = await getPrestamo(req.params.id, req.user);
  res.json(prestamo);
}));

// --- Acciones de gestor -----------------------------------------------------

// PATCH /api/v1/prestamos/:id/aceptar
router.patch('/:id/aceptar', requireRol('gestor'), handle(async (req, res) => {
  const data = await aceptarPrestamo(req.params.id, req.user.id, req.body?.observacion);
  res.json(data);
}));

// PATCH /api/v1/prestamos/:id/rechazar
router.patch('/:id/rechazar', requireRol('gestor'), handle(async (req, res) => {
  const data = await rechazarPrestamo(req.params.id, req.user.id, req.body?.observacion);
  res.json(data);
}));

// PATCH /api/v1/prestamos/:id/devolver
router.patch('/:id/devolver', requireRol('gestor'), handle(async (req, res) => {
  const data = await devolverPrestamo(req.params.id, req.user.id);
  res.json(data);
}));

export default router;
