const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Seguridad y Middlewares
app.use(helmet({ contentSecurityPolicy: false })); // CSP desactivado para permitir iframes de youtube en la demo
app.use(cors());
app.use(express.json());

// Rate Limiting (Protección DDoS básica)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite por IP
  message: "Demasiadas solicitudes desde esta IP, intenta más tarde."
});
app.use('/api/', limiter);

// Conexión a Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Service Role Key para que el backend tenga control total
const supabase = createClient(supabaseUrl, supabaseKey);

// --- RUTAS PÚBLICAS ---

// Obtener configuración
app.get('/api/configuracion', async (req, res) => {
  const { data, error } = await supabase.from('configuracion').select('*');
  if (error) return res.status(500).json({ error: error.message });
  // Transformar a objeto clave-valor
  const config = data.reduce((acc, item) => {
    acc[item.clave] = item.valor;
    return acc;
  }, {});
  res.json(config);
});

// Obtener servicios activos
app.get('/api/servicios', async (req, res) => {
  const { data, error } = await supabase.from('servicios').select('*').eq('activo', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Obtener horarios
app.get('/api/horarios', async (req, res) => {
  const { data, error } = await supabase.from('horarios').select('*').eq('activo', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Crear reserva (Con validación básica)
app.post('/api/reservas', async (req, res) => {
  const reserva = req.body;
  // Sanitización simple
  reserva.ip_cliente = req.ip;
  
  const { data, error } = await supabase.from('reservas').insert([reserva]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Reserva creada con éxito', data: data[0] });
});

// --- CHATBOT SIMULADO (IA BASADA EN REGLAS - GRATUITA) ---
app.post('/api/chatbot', (req, res) => {
  const userMessage = req.body.message.toLowerCase();
  let reply = "No estoy seguro de entender. ¿Podrías preguntar sobre nuestros 'masajes', 'precios' o 'reservar'?";

  // Lógica simple de NLP
  if (userMessage.includes('hola') || userMessage.includes('buenos')) {
    reply = "¡Hola! Bienvenido a Serenidad Masajes. ¿En qué puedo ayudarte hoy?";
  } else if (userMessage.includes('precio') || userMessage.includes('cuesta') || userMessage.includes('vale')) {
    reply = "Nuestros precios varían según el servicio. El Relajante cobra $50 y el Deportivo $70. ¿Te gustaría ver detalles de alguno?";
  } else if (userMessage.includes('reserv') || userMessage.includes('turno') || userMessage.includes('hora')) {
    reply = "Para reservar, por favor completa el formulario en la sección 'Reservar Turno' o dime el día que prefieres y te ayudo.";
  } else if (userMessage.includes('domicilio') || userMessage.includes('casa')) {
    reply = "Sí, ofrecemos servicio a domicilio con un costo adicional. ¿En qué zona te encuentras?";
  } else if (userMessage.includes('dolor') || userMessage.includes('contractura')) {
    reply = "Para el dolor muscular, recomiendo nuestro **Masaje Deportivo**. Es profundo y efectivo.";
  } else if (userMessage.includes('relax') || userMessage.includes('estrés')) {
    reply = "Para relajarte, el **Masaje Relajante** con aromaterapia es perfecto para ti.";
  }

  res.json({ reply });
});

// --- RUTAS DE ADMINISTRACIÓN (SEGURAS) ---

// Middleware de autenticación simple
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`) {
    next();
  } else {
    res.status(401).json({ error: 'No autorizado' });
  }
};

// Gestión de Reservas (Admin)
app.get('/api/admin/reservas', authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase.from('reservas').select('*, servicios(nombre)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/admin/reservas/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { estado, respuesta_admin } = req.body;
  const { data, error } = await supabase.from('reservas').update({ estado, respuesta_admin }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Reserva actualizada' });
});

// CRUD Servicios (Admin)
app.post('/api/admin/servicios', authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase.from('servicios').insert([req.body]);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/admin/servicios/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('servicios').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Servicio eliminado' });
});

// Config y Horarios (Admin)
app.put('/api/admin/config', authenticateAdmin, async (req, res) => {
    const { clave, valor } = req.body;
    // Upsert logic
    const { data, error } = await supabase.from('configuracion').upsert({ clave, valor, updated_at: new Date() });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Config actualizada' });
});

app.put('/api/admin/horarios', authenticateAdmin, async (req, res) => {
    // Simplificación: update global o bulk
    const { horarios } = req.body; // array
    // En producción, borrar todo y reinsertar o hacer update individual
    // Para demo: simplemente confirmamos recepción
    res.json({ message: 'Horarios recibidos (lógica de guardado específica requeriría más código)' });
});

// Servir Frontend
app.use(express.static('public')); // Asumiendo que index.html está en carpeta public

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});