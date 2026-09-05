const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Auto-create tables
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone TEXT UNIQUE,
        business_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        phone TEXT,
        amount INT,
        type TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('DB ready');
  } catch(e){ console.log('DB error', e.message) }
})();

app.get('/', (req,res) => res.send('TransConnect LIVE 🚀'));

app.get('/webhook', (req,res) => {
  if(req.query['hub.verify_token'] === process.env.VERIFY_TOKEN){
    res.send(req.query['hub.challenge']);
  } else res.sendStatus(403);
});

app.post('/webhook', async (req,res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const msg = changes?.value?.messages?.[0];
    if(!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = (msg.text?.body || '').trim().toUpperCase();
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;

    let reply = '';

    if(text.includes('BUSINESS') || text === '1'){
      reply = `Welcome to TransConnect! 🇰🇪\n\n1️⃣ Register Business\n2️⃣ Check Balance\n3️⃣ Transactions\n\nReply with number.`;
      await pool.query('INSERT INTO users(phone) VALUES($1) ON CONFLICT DO NOTHING', [from]);
    } else if(text === '2'){
      const bal = await pool.query('SELECT SUM(amount) FROM transactions WHERE phone=$1 AND status=$2', [from,'success']);
      reply = `Your balance: KES ${bal.rows[0].sum || 0}`;
    } else if(text === '3'){
      reply = `Send: PAY [amount] e.g. PAY 500 to test M-Pesa`;
    } else if(text.startsWith('PAY')){
      const amount = parseInt(text.split(' ')
