import { Router } from 'express';
import { registrar, login, obtenerPorId, AuthError } from '../services/auth.service.js';
import { verifyToken } from '../middlewares/auth.js';

const router = Router();

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// POST /api/v1/auth/registro  -> crea usuario (rol solicitante) + token
router.post('/registro', handle(async (req, res) => {
  const { email, password, nombre } = req.body;
  const result = await registrar({ email, password, nombre });
  res.status(201).json(result);
}));

// POST /api/v1/auth/login  -> { usuario, token }
router.post('/login', handle(async (req, res) => {
  const { email, password } = req.body;
  const result = await login({ email, password });
  res.json(result);
}));

// GET /api/v1/auth/me  -> datos del usuario autenticado
router.get('/me', verifyToken, handle(async (req, res) => {
  const usuario = await obtenerPorId(req.user.id);
  if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
  res.json({ usuario });
}));

export default router;
