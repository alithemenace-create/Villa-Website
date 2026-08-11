/**
 * VillaEscapes API — Express Backend
 * ────────────────────────────────────
 * Serves the frontend HTML at GET / with villas pre-injected as
 * window.__VILLAS__ so the client renders instantly — zero loading spinner.
 *
 * Endpoints:
 *   GET    /                            Frontend (SSR villa data injected)
 *   GET    /api/villas                  Public villa JSON
 *   POST   /api/villas                  Add villa (admin)
 *   PATCH  /api/villas/:id             Update villa (admin)
 *   DELETE /api/villas/:id             Remove villa (admin)
 *   POST   /api/bookings               Guest booking
 *   GET    /api/bookings               All bookings (admin)
 *   PATCH  /api/bookings/:id/status    Update booking status (admin)
 *   POST   /api/images/validate        Validate image URLs (admin)
 *
 * Auth: admin routes require header  X-Admin-Secret: <ADMIN_SECRET>
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

// ── CONFIG ────────────────────────────────────────────────────────────────────
const PORT         = process.env.PORT         || 3001;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'lumiere@Admin2025';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');

// Path to the frontend HTML — lives in the same repo root
const HTML_PATH = path.join(__dirname, 'villa-villascapes.html');

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Render health checks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Admin-Secret'],
  credentials: false,
}));

// Explicitly handle preflight for all routes
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== ADMIN_SECRET)
    return res.status(401).json({ error: 'Unauthorised' });
  next();
}

// ── IN-MEMORY DATABASE ────────────────────────────────────────────────────────
const db = {
  villas: [
    {
      id: uuidv4(),
      name: 'Lonavala Valley Retreat',
      location: 'Lonavala',
      rate: 45000,
      beds: 4,
      baths: 4,
      guests: 8,
      badge: 'Popular',
      description: 'A stunning valley-facing estate with a private pool and panoramic monsoon views.',
      images: [
        'https://images.unsplash.com/photo-1596178060810-72c953d1cddd?w=800&q=80',
        'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80',
      ],
      status: 'Active',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Pawna Lake Villa',
      location: 'Lonavala',
      rate: 38000,
      beds: 3,
      baths: 3,
      guests: 6,
      badge: 'Lakefront',
      description: 'Right on the Pawna Lake shoreline — wake up to still water and distant Sahyadri peaks.',
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
      ],
      status: 'Active',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Mahabaleshwar Heights',
      location: 'Mahabaleshwar',
      rate: 55000,
      beds: 5,
      baths: 5,
      guests: 10,
      badge: 'New',
      description: 'Clifftop luxury with strawberry-farm views and a private heated pool.',
      images: [
        'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80',
        'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80',
      ],
      status: 'Active',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Panchgani Clifftop Estate',
      location: 'Panchgani',
      rate: 62000,
      beds: 6,
      baths: 6,
      guests: 12,
      badge: 'Exclusive',
      description: 'Table Land vistas, a sunken lounge and a chef-grade outdoor kitchen.',
      images: [
        'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80',
      ],
      status: 'Active',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Mahabaleshwar Strawberry Manor',
      location: 'Mahabaleshwar',
      rate: 48000,
      beds: 4,
      baths: 4,
      guests: 8,
      badge: 'Best Value',
      description: 'Surrounded by working strawberry farms — fresh produce delivered to your door.',
      images: [
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80',
      ],
      status: 'Active',
      createdAt: new Date().toISOString(),
    },
  ],
  bookings: [],
};

// ── SSR HELPER ────────────────────────────────────────────────────────────────
// Reads the HTML file and injects active villa data as window.__VILLAS__
// so the browser can render the grid immediately — no spinner, no fetch wait.
function buildPage() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const activeVillas = db.villas.filter(v => v.status === 'Active');
  const injection = `<script>window.__VILLAS__ = ${JSON.stringify(activeVillas)};</script>`;
  return html.replace('<!-- __VILLAS_DATA__ -->', injection);
}

// ── VALIDATION HELPERS ────────────────────────────────────────────────────────
function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

function validateVilla(body) {
  const errors = [];
  if (!body.name?.trim())     errors.push('name is required');
  if (!body.location?.trim()) errors.push('location is required');
  const rate = Number(body.rate);
  if (!rate || rate < 1000 || rate > 1000000) errors.push('rate must be ₹1,000–₹10,00,000');
  if (!Number.isInteger(Number(body.beds))   || Number(body.beds)   < 1) errors.push('beds must be ≥1');
  if (!Number.isInteger(Number(body.guests)) || Number(body.guests) < 1) errors.push('guests must be ≥1');
  const imgs = Array.isArray(body.images) ? body.images : [];
  imgs.forEach((u, i) => { if (!isValidUrl(u)) errors.push(`images[${i}] invalid URL`); });
  if (imgs.length > 5) errors.push('max 5 images');
  return errors;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── FRONTEND (SSR) ────────────────────────────────────────────────────────────
// Serve the HTML with villas already embedded — client renders immediately
app.get('/', (_req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache'); // always fresh villa data
    res.send(buildPage());
  } catch (err) {
    console.error('Failed to serve page:', err.message);
    res.status(500).send('Server error — could not load page.');
  }
});

// ── VILLAS (JSON API) ─────────────────────────────────────────────────────────
app.get('/api/villas', (req, res) => {
  const { location, maxRate, minGuests } = req.query;
  let results = db.villas.filter(v => v.status === 'Active');
  if (location)  results = results.filter(v => v.location.toLowerCase().includes(location.toLowerCase()));
  if (maxRate)   results = results.filter(v => v.rate <= Number(maxRate));
  if (minGuests) results = results.filter(v => v.guests >= Number(minGuests));
  res.json({ villas: results, total: results.length });
});

app.post('/api/villas', requireAdmin, (req, res) => {
  const errors = validateVilla(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const villa = {
    id:          uuidv4(),
    name:        req.body.name.trim(),
    location:    req.body.location.trim(),
    rate:        Number(req.body.rate),
    beds:        Number(req.body.beds),
    baths:       Number(req.body.baths || req.body.beds),
    guests:      Number(req.body.guests),
    badge:       req.body.badge || '',
    description: (req.body.description || '').trim(),
    images:      (req.body.images || []).filter(isValidUrl).slice(0, 5),
    status:      req.body.status === 'Inactive' ? 'Inactive' : 'Active',
    createdAt:   new Date().toISOString(),
  };
  db.villas.unshift(villa);
  console.log(`[VILLA] Added "${villa.name}" (${villa.id})`);
  res.status(201).json({ villa });
});

app.patch('/api/villas/:id', requireAdmin, (req, res) => {
  const villa = db.villas.find(v => v.id === req.params.id);
  if (!villa) return res.status(404).json({ error: 'Villa not found' });
  ['name','location','rate','beds','baths','guests','badge','description','images','status']
    .forEach(f => { if (req.body[f] !== undefined) villa[f] = req.body[f]; });
  if (req.body.images) villa.images = req.body.images.filter(isValidUrl).slice(0, 5);
  res.json({ villa });
});

app.delete('/api/villas/:id', requireAdmin, (req, res) => {
  const idx = db.villas.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Villa not found' });
  const [removed] = db.villas.splice(idx, 1);
  console.log(`[VILLA] Removed "${removed.name}"`);
  res.json({ message: 'Villa removed', id: removed.id });
});

// ── IMAGE VALIDATION ──────────────────────────────────────────────────────────
app.post('/api/images/validate', requireAdmin, async (req, res) => {
  const urls = (Array.isArray(req.body.urls) ? req.body.urls : []).slice(0, 5);
  const results = await Promise.all(urls.map(async (url) => {
    if (!isValidUrl(url)) return { url, valid: false, reason: 'Invalid URL' };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
      const ct = r.headers.get('content-type') || '';
      if (!r.ok) return { url, valid: false, reason: `HTTP ${r.status}` };
      if (!ct.startsWith('image/')) return { url, valid: false, reason: `Not an image (${ct})` };
      return { url, valid: true };
    } catch (e) {
      return { url, valid: false, reason: e.name === 'AbortError' ? 'Timed out' : 'Unreachable' };
    }
  }));
  res.json({ results });
});

// ── BOOKINGS ──────────────────────────────────────────────────────────────────
app.post('/api/bookings', (req, res) => {
  const { villa_id, guest_name, email, phone, checkin, checkout, guests, special_requests } = req.body;
  const errors = [];
  if (!villa_id)   errors.push('villa_id required');
  if (!guest_name) errors.push('guest_name required');
  if (!email)      errors.push('email required');
  if (!phone)      errors.push('phone required');
  if (!checkin)    errors.push('checkin required');
  if (!checkout)   errors.push('checkout required');
  if (checkin && checkout && checkin >= checkout) errors.push('checkout must be after checkin');
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const villa = db.villas.find(v => v.id === villa_id);
  if (!villa) return res.status(404).json({ error: 'Villa not found' });

  const nights   = Math.round((new Date(checkout) - new Date(checkin)) / 86400000);
  const subtotal = nights * villa.rate;
  const fee      = Math.round(subtotal * 0.08);

  const booking = {
    id:               uuidv4(),
    villa_id,
    villa_name:       villa.name,
    guest_name:       guest_name.trim(),
    email:            email.trim(),
    phone:            phone.trim(),
    checkin,
    checkout,
    guests:           Number(guests) || 1,
    special_requests: (special_requests || '').trim(),
    nights,
    rate:             villa.rate,
    subtotal,
    fee,
    total:            subtotal + fee,
    status:           'Pending',
    createdAt:        new Date().toISOString(),
  };

  db.bookings.unshift(booking);
  console.log(`[BOOKING] ${booking.guest_name} → ${villa.name} (${booking.id})`);
  res.status(201).json({ booking, message: 'Booking received — our concierge will be in touch within 24 hours.' });
});

app.get('/api/bookings', requireAdmin, (req, res) => {
  let results = db.bookings;
  if (req.query.status)   results = results.filter(b => b.status === req.query.status);
  if (req.query.villa_id) results = results.filter(b => b.villa_id === req.query.villa_id);
  if (req.query.from)     results = results.filter(b => b.checkin >= req.query.from);
  if (req.query.to)       results = results.filter(b => b.checkout <= req.query.to);
  res.json({ bookings: results, total: results.length });
});

app.patch('/api/bookings/:id/status', requireAdmin, (req, res) => {
  const booking = db.bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const allowed = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
  if (!allowed.includes(req.body.status))
    return res.status(400).json({ error: `status must be: ${allowed.join(', ')}` });
  booking.status = req.body.status;
  res.json({ booking });
});

// ── CATCH-ALL ─────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏡  VillaEscapes running → http://localhost:${PORT}`);
  console.log(`    Admin secret : ${ADMIN_SECRET}`);
  console.log(`    Villas seeded: ${db.villas.length}`);
  console.log(`    HTML file    : ${HTML_PATH}\n`);
});
