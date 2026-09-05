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
  } catch(e){
    console.log('DB error', e.message);
  }
})();

app.get('/', (req,res) => {
  res.send('TransConnect LIVE');
});

app.get('/webhook', (req,res) => {
  if(req.query['hub.verify_token'] === process.env.VERIFY_TOKEN){
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req,res) => {
  try {
    const entry = req.body.entry && req.body.entry[0];
    const changes = entry && entry.changes && entry.changes[0];
    const msg = changes && changes.value && changes.value.messages && changes.value.messages[0];
    if(!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = (msg.text && msg.text.body? msg.text.body : '').trim().toUpperCase();
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;

    let reply = 'Hi! Send BUSINESS to start. You said: ' + text;

    if(text.includes('BUSINESS') || text === '1'){
      reply = 'Welcome to TransConnect!\n\n1. Register Business\n2. Check Balance\n3. Transactions\n\nReply with number.';
      await pool.query('INSERT INTO users(phone) VALUES($1) ON CONFLICT DO NOTHING', [from]);
    } else if(text === '2'){
      const bal = await pool.query('SELECT SUM(amount) FROM transactions WHERE phone=$1 AND status=$2', [from,'success']);
      const total = bal.rows[0].sum || 0;
      reply = 'Your balance: KES ' + total;
    } else if(text.startsWith('PAY')){
      const parts = text.split(' ');
      const amount = parseInt(parts[1]) || 10;
      reply = 'Initiating M-Pesa KES ' + amount + '... Check phone.';
    }

    await axios.post('https://graph.facebook.com/v20.0/' + phoneId + '/messages', {
      messaging_product: 'whatsapp',
      to: from,
      text: { body: reply }
    }, {
      headers: { Authorization: 'Bearer ' + token }
    });

  } catch(e){
    console.log(e.response? e.response.data : e.message);
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('Running on ' + PORT);
});
