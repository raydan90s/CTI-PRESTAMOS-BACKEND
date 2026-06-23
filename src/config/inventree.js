import https from 'https';
import axios from 'axios';

const { INVENTREE_URL, INVENTREE_TOKEN } = process.env;

if (!INVENTREE_URL || !INVENTREE_TOKEN) {
  console.warn('⚠️  INVENTREE_URL o INVENTREE_TOKEN no están definidos en el .env');
}

// El servidor de ESPOL usa un certificado interno/self-signed, por eso se
// desactiva la verificación del certificado. Solo es accesible desde la VPN.
const inventree = axios.create({
  baseURL: `${INVENTREE_URL?.replace(/\/$/, '')}/api`,
  timeout: 15000,
  headers: {
    Authorization: `Token ${INVENTREE_TOKEN}`,
    Accept: 'application/json',
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

export default inventree;
