import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import pool from './config/db.js';

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
  req.pool = pool;
  next();
});

app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ server_time: result.rows[0] });
  } catch (error) {
    console.error('Error consultando la BD:', error);
    res.status(500).json({ message: 'Error al conectar con la base de datos' });
  }
});

export default app;
