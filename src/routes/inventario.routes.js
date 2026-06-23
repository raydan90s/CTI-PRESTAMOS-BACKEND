import { Router } from 'express';
import {
  listarStock,
  getStockItem,
  listarUbicaciones,
  listarPartes,
} from '../services/inventree.service.js';

const router = Router();

// Pequeño wrapper para no repetir try/catch en cada handler.
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/inventario  -> lista stock items (en vivo desde InvenTree)
// query: search, location, part, limit, offset, ordering
router.get('/inventario', handle(async (req, res) => {
  const { search, location, part, limit = 50, offset = 0, ordering } = req.query;
  const data = await listarStock({ search, location, part, limit, offset, ordering });
  res.json(data);
}));

// GET /api/v1/inventario/:id  -> un stock item
router.get('/inventario/:id', handle(async (req, res) => {
  const item = await getStockItem(req.params.id);
  res.json(item);
}));

// GET /api/v1/ubicaciones  -> ubicaciones de stock
router.get('/ubicaciones', handle(async (req, res) => {
  const { search, limit = 100, offset = 0 } = req.query;
  const data = await listarUbicaciones({ search, limit, offset });
  res.json(data);
}));

// GET /api/v1/partes  -> catálogo de partes
router.get('/partes', handle(async (req, res) => {
  const { search, category, limit = 50, offset = 0 } = req.query;
  const data = await listarPartes({ search, category, limit, offset });
  res.json(data);
}));

export default router;
