import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

const { JWT_SECRET, JWT_EXPIRES_IN = '7d' } = process.env;

// Error de negocio con código HTTP, para responder limpio desde las rutas.
export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Devuelve el usuario (sin password_hash) listo para enviar al cliente. */
function publico(u) {
  if (!u) return u;
  const { password_hash, ...rest } = u;
  return rest;
}

/** Firma un JWT con los datos mínimos del usuario. */
export function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, email: usuario.email, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

/** Registra un usuario. Por seguridad siempre se crea como 'solicitante'. */
export async function registrar({ email, password, nombre }) {
  email = String(email ?? '').trim().toLowerCase();
  nombre = String(nombre ?? '').trim();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new AuthError('Email inválido');
  if (!password || password.length < 6) throw new AuthError('La contraseña debe tener al menos 6 caracteres');
  if (!nombre) throw new AuthError('El nombre es obligatorio');

  // ¿ya existe?
  const { data: existente, error: e1 } = await supabase
    .from('usuarios').select('id').eq('email', email).maybeSingle();
  if (e1) throw new AuthError('Error consultando usuarios', 502);
  if (existente) throw new AuthError('Ya existe un usuario con ese email', 409);

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('usuarios')
    .insert({ email, password_hash, nombre, rol: 'solicitante' })
    .select()
    .single();
  if (error) throw new AuthError('No se pudo crear el usuario', 502);

  return { usuario: publico(data), token: firmarToken(data) };
}

/** Valida credenciales y devuelve token. */
export async function login({ email, password }) {
  email = String(email ?? '').trim().toLowerCase();
  if (!email || !password) throw new AuthError('Email y contraseña son obligatorios');

  const { data: usuario, error } = await supabase
    .from('usuarios').select('*').eq('email', email).maybeSingle();
  if (error) throw new AuthError('Error consultando usuarios', 502);

  // Mensaje genérico para no revelar si el email existe.
  if (!usuario) throw new AuthError('Credenciales inválidas', 401);
  if (!usuario.activo) throw new AuthError('Usuario inactivo', 403);

  const ok = await bcrypt.compare(password, usuario.password_hash);
  if (!ok) throw new AuthError('Credenciales inválidas', 401);

  return { usuario: publico(usuario), token: firmarToken(usuario) };
}

/** Devuelve el usuario actual por id (para /me). */
export async function obtenerPorId(id) {
  const { data, error } = await supabase
    .from('usuarios').select('*').eq('id', id).maybeSingle();
  if (error) throw new AuthError('Error consultando usuario', 502);
  return publico(data);
}
