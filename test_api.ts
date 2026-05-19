import http from 'http';

const data = JSON.stringify({"testType":"bigfive", "userScores":{"O":50}, "partnerScores":{"O":60}, "summary":{"O":{"title":"Openness"}}, "language":"ru"});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/compatibility',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', console.error);
req.write(data);
req.end();
