import jwt from 'jsonwebtoken';

const { JWT_SECRET } = process.env;

/**
 * Verifica el JWT del header `Authorization: Bearer <token>`.
 * Si es válido, deja los datos del usuario en req.user = { id, email, rol }.
 */
export function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Falta el token de autenticación' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, rol: payload.rol };
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

/**
 * Exige que el usuario tenga uno de los roles indicados.
 * Uso: router.get('/x', verifyToken, requireRol('gestor'), handler)
 */
export function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ message: 'No tienes permisos para esta acción' });
    }
    next();
  };
}
