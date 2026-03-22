require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

app.use(express.static('public'));

// Routes
try {
  app.use('/api/auth', require('./auth'));
  app.use('/api/leads', require('./leads'));
  app.use('/api/reminders', require('./reminders'));
  app.use('/api/ai', require('./ai'));
} catch(e) {
  console.log('Route error:', e.message);
}

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'NovaCRM API is running!',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected!');
    app.listen(PORT, () => {
      console.log(`🚀 NovaCRM running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

startServer();
