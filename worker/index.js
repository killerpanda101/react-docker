const keys = require('./keys');
const redis = require('redis');

const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000
});
const sub = redisClient.duplicate();

function fib(index) {
  if (index < 2) return 1;
  return fib(index - 1) + fib(index - 2);
}

sub.on('message', (channel, message) => {
  // Only compute for small non-negative integers: fib() is exponential and
  // runs synchronously, so unchecked input could pin the CPU.
  if (!/^\d+$/.test(message) || parseInt(message, 10) > 40) {
    return;
  }
  redisClient.hset('values', message, fib(parseInt(message, 10)));
});
sub.subscribe('insert');
