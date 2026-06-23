// Manejador de errores centralizado. Traduce errores de axios (InvenTree) a
// respuestas limpias sin filtrar detalles internos.
export function errorHandler(err, _req, res, _next) {
  // Error proveniente de una llamada a InvenTree (axios)
  if (err.isAxiosError) {
    const status = err.response?.status || 502;
    const detail = err.response?.data || err.message;
    console.error('Error InvenTree:', status, detail);

    if (err.code === 'ECONNABORTED' || !err.response) {
      return res.status(504).json({
        message: 'No se pudo conectar con InvenTree. ¿Estás en la red/VPN de ESPOL?',
      });
    }
    return res.status(status).json({ message: 'Error consultando InvenTree', detail });
  }

  console.error('Error no controlado:', err);
  res.status(500).json({ message: 'Error interno del servidor' });
}
