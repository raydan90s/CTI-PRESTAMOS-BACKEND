import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import supabase from './config/supabase.js';
import authRoutes from './routes/auth.routes.js';
import inventarioRoutes from './routes/inventario.routes.js';
import prestamosRoutes from './routes/prestamos.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(morgan('dev'));

app.use(cors({
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  req.supabase = supabase;
  next();
});

// Health: verifica conectividad con Supabase vía API HTTPS (443).
app.get('/', async (_req, res) => {
  // Llamada ligera a PostgREST. Si las tablas aún no existen, igual confirma
  // que la conexión y la key funcionan (error de "tabla no encontrada" != red).
  const { error } = await supabase.from('usuarios').select('id', { head: true, count: 'exact' });

  if (error && error.code !== '42P01') { // 42P01 = tabla inexistente (aún no creada)
    console.error('Error Supabase:', error.message);
    return res.status(502).json({ ok: false, supabase: 'error', detail: error.message });
  }

  res.json({
    ok: true,
    supabase: 'conectado',
    tablas_creadas: !error, // false si falta correr schema.sql
  });
});

// Autenticación (usuarios propios en Supabase)
app.use('/api/v1/auth', authRoutes);

// Inventario (lectura en vivo desde InvenTree)
app.use('/api/v1', inventarioRoutes);

// Préstamos (flujo en Supabase + reflejo en InvenTree)
app.use('/api/v1/prestamos', prestamosRoutes);

app.use(errorHandler);

export default app;
