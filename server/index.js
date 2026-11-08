const keys = require('./keys');

// Express App Setup
const express = require('express');
const cors = require('cors');

const app = express();
app.disable('x-powered-by');
// The app is served same-origin through nginx, so CORS is off unless an
// explicit origin is configured.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN }));
}
app.use(express.json({ limit: '10kb' }));

// Postgres Client Setup
const { Pool } = require('pg');
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort
});
pgClient.on('error', () => console.log('Lost PG connection'));

pgClient
  .query('CREATE TABLE IF NOT EXISTS values (number INT)')
  .catch(err => console.log(err));

// Redis Client Setup
const redis = require('redis');
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000
});
const redisPublisher = redisClient.duplicate();

// Express route handlers

app.get('/', (req, res) => {
  res.send('Hi');
});

app.get('/values/all', async (req, res) => {
  try {
    const values = await pgClient.query('SELECT * from values');
    res.send(values.rows);
  } catch (err) {
    console.log(err);
    res.status(500).send('Internal error');
  }
});

app.get('/values/current', (req, res) => {
  redisClient.hgetall('values', (err, values) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Internal error');
    }
    res.send(values || {});
  });
});

app.post('/values', async (req, res) => {
  const raw = req.body && req.body.index;
  const index = typeof raw === 'string' && /^\d+$/.test(raw.trim())
    ? parseInt(raw, 10)
    : raw;

  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).send('Index must be a non-negative integer');
  }

  if (index > 40) {
    return res.status(422).send('Index too high');
  }

  try {
    await pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);
  } catch (err) {
    console.log(err);
    return res.status(500).send('Internal error');
  }

  redisClient.hset('values', index, 'Nothing yet!');
  redisPublisher.publish('insert', String(index));

  res.send({ working: true });
});

// Last-resort error handler (e.g. malformed JSON bodies)
app.use((err, req, res, next) => {
  res.status(err.status || 500).send('Bad request');
});

app.listen(5000, err => {
  console.log('Listening');
});
