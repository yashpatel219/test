import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import bodyParser from 'body-parser';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import userRoutes from './routes/userRoutes.js';
import webhookRoutes from './routes/webhook.js';
import paymentRoutes from './routes/paymentRoutes.js';
import offerRoutes from './routes/offer.route.js';

import Payment from './models/Payment.js';
import User from './models/User.js';

dotenv.config();

const app = express();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// CORS configuration - Update with your frontend URL
const allowedOrigins = [
  "http://localhost:5173",
  "https://test-project-ten-fawn.vercel.app",
  "http://localhost:3000",
  "http://localhost:4173",
];

// Enhanced CORS middleware with detailed logging
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('🌐 Incoming request:', {
    method: req.method,
    path: req.path,
    origin: origin,
    'user-agent': req.headers['user-agent']
  });

  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  
  // Set CORS headers manually for better control
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log('✅ CORS header set for origin:', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🛬 Preflight request handled');
    return res.status(200).end();
  }
  
  next();
});

// Additional CORS middleware for extra protection
app.use(cors({
  origin: function (origin, callback) {
    console.log('🔍 CORS checking origin:', origin);
    
    // Allow requests with no origin (like mobile apps, curl requests, server-to-server)
    if (!origin) {
      console.log('✅ Allowing request with no origin');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Allowed by CORS:', origin);
      callback(null, true);
    } else {
      console.log('🔴 Blocked by CORS:', origin);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Webhook raw parser
app.use('/api/webhook', bodyParser.raw({ type: 'application/json' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log('📥 Request:', {
    method: req.method,
    url: req.url,
    query: req.query,
    body: req.method === 'POST' ? req.body : null,
    timestamp: new Date().toISOString()
  });
  next();
});

// API Routes
app.use('/api/webhook', webhookRoutes);
app.use('/api/users', userRoutes);
app.use('/api', paymentRoutes);
app.use('/offer', offerRoutes);

// Health check endpoint with detailed info
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    allowedOrigins: allowedOrigins,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint for donations
app.get('/api/test-donations', async (req, res) => {
  try {
    const { username } = req.query;
    console.log('🧪 Test donations endpoint called with username:', username);
    
    // Return mock data for testing
    res.json([
      { amount: 500, createdAt: new Date(), name: "Test Donor 1" },
      { amount: 1000, createdAt: new Date(), name: "Test Donor 2" }
    ]);
  } catch (err) {
    console.error('Test endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'UNESSA Foundation Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      users: '/api/users',
      payments: '/api/payments',
      webhook: '/api/webhook',
      offers: '/offer',
      test: '/api/test-donations?username=test'
    },
    allowedOrigins: allowedOrigins,
    documentation: 'Check API docs for more information'
  });
});

// HTTP server + Socket.IO
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Enhanced Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🟢 Socket connected: ${socket.id}`);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`🔴 Socket disconnected: ${socket.id} — reason: ${reason}`);
  });
  
  socket.on('error', (error) => {
    console.error(`❌ Socket error (${socket.id}):`, error);
  });
});

// Razorpay: Create Order
app.post("/api/create-order", async (req, res) => {
  try {
    console.log('💳 Create order request:', req.body);
    const { name, email, phone, amount, anonymous, address } = req.body;
    
    if (!amount) return res.status(400).json({ error: "Amount is required" });

    const total = amount * 100; // in paise
    const order = await razorpay.orders.create({
      amount: total,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: { name, email, phone, anonymous, address },
    });

    console.log('✅ Order created:', order.id);
    
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      name: anonymous ? "Anonymous Donor" : name,
    });
  } catch (err) {
    console.error("🔴 Create Order Error:", err);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// Razorpay: Verify Payment
app.post('/api/verify-payment', (req, res) => {
  console.log('🔐 Verify payment request:', req.body);
  
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification parameters' });
  }

  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest('hex');

  if (generated_signature === razorpay_signature) {
    console.log('✅ Payment verified successfully');
    return res.json({ status: 'Payment verified successfully' });
  } else {
    console.log('❌ Invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }
});

// Save Payment & Update User Amount
app.post('/api/save-payment', async (req, res) => {
  try {
    console.log('💾 Save payment request:', req.body);
    
    const { refName, name, email, phone, amount, anonymous, address, razorpay_order_id, razorpay_payment_id } = req.body;

    const payment = new Payment({
      refName, name, email, phone, amount, anonymous, address, razorpay_order_id, razorpay_payment_id
    });
    
    await payment.save();
    console.log('✅ Payment saved:', payment._id?.toString() || payment);

    if (refName) {
      const updatedUser = await User.findOneAndUpdate(
        { username: refName },
        { $inc: { amount: amount } },
        { new: true }
      );
      
      if (updatedUser) {
        console.log(`✅ Updated ${refName}'s amount:`, updatedUser.amount);
      } else {
        console.warn(`⚠️ Referred user '${refName}' not found`);
      }
    }

    // Emit to all connected clients
    io.emit('paymentSuccess', { 
      refName: refName || null, 
      amount,
      paymentId: payment._id,
      timestamp: new Date()
    });
    
    console.log(`🔔 Emitted paymentSuccess event (refName=${refName}, amount=${amount})`);

    res.status(201).json({ 
      success: true, 
      message: "Payment saved successfully!",
      paymentId: payment._id
    });
  } catch (err) {
    console.error("❌ Save Payment Error:", err);
    res.status(500).json({ success: false, error: "Server error", details: err.message });
  }
});

// Get donations by username
app.get('/api/donations', async (req, res) => {
  try {
    const { username } = req.query;
    console.log('📊 Fetching donations for username:', username);
    
    if (!username) {
      return res.status(400).json({ error: 'Username parameter is required' });
    }

    const donations = await Payment.find({ refName: username })
      .sort({ createdAt: -1 })
      .select('name amount createdAt anonymous');
    
    console.log(`✅ Found ${donations.length} donations for ${username}`);
    
    res.json(donations);
  } catch (err) {
    console.error('❌ Donations fetch error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// MongoDB Connection with enhanced logging
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ MongoDB Connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1); // Exit process if DB connection fails
  });

// MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB Error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔴 MongoDB Disconnected');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("🔥 Global Error Handler:", err.stack);
  
  if (err.message.includes('CORS')) {
    return res.status(403).json({ 
      error: 'CORS Error', 
      message: err.message,
      allowedOrigins: allowedOrigins,
      yourOrigin: req.headers.origin
    });
  }
  
  res.status(500).json({ 
    error: "Something went wrong",
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 Handler for API routes
app.use('/api/*', (req, res) => {
  console.log('❌ API endpoint not found:', req.originalUrl);
  res.status(404).json({ 
    error: 'API endpoint not found',
    message: 'Check the API documentation for available endpoints',
    requestedUrl: req.originalUrl
  });
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running at http://localhost:${PORT}`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🕒 Server started at: ${new Date().toISOString()}`);
});
