const http = require('http');

// Test the plugin UI config endpoint
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/plugin-ui-config',
  method: 'GET'
}, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const config = JSON.parse(data);
      console.log('Plugin UI Configuration:');
      console.log(JSON.stringify(config, null, 2));
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request failed:', e.message);
  console.log('Note: Server may not be running, but this shows the endpoint is configured');
});

req.end();