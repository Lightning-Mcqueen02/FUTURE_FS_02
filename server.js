require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { startCronJobs } = require('./services/cronService');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', 'null'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

app.use(express.static('public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/ai', require('./routes/ai'));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'NovaCRM API is running',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected!');
    startCronJobs();
    app.listen(PORT, () => {
      console.log(`🚀 NovaCRM running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

startServer();