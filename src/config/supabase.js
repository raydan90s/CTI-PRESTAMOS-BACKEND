import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.warn('⚠️  SUPABASE_URL o SUPABASE_SECRET_KEY no están definidos en el .env');
}

// Cliente de servidor: usa la SECRET key (se salta RLS) y trabaja sobre HTTPS/443.
// Esto es lo que permite usar Supabase aun estando dentro de la VPN de ESPOL,
// que bloquea el puerto Postgres 5432.
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default supabase;
