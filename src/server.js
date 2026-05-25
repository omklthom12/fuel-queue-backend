const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const { getDb } = require('./database/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Fuel Queue Management API is running',
    version: '1.0.0',
    docs: '/api/health',
  });
});

app.get('/api/health', async (req, res) => {
  await getDb();
  res.json({ success: true, message: 'API and database are ready' });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/stations', require('./routes/stationRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api', require('./routes/engagementRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.use(notFound);
app.use(errorHandler);

getDb()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`✅ Fuel Queue API running on http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
