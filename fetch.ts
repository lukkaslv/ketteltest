import https from 'https';
import fs from 'fs';

const url = 'https://psylab.info/%D0%9C%D0%B5%D1%82%D0%BE%D0%B4%D0%B8%D0%BA%D0%B0_%D0%BC%D0%BD%D0%BE%D0%B3%D0%BE%D1%84%D0%B0%D0%BA%D1%82%D0%BE%D1%80%D0%BD%D0%BE%D0%B3%D0%BE_%D0%B8%D1%81%D1%81%D0%BB%D0%B5%D0%B4%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F_%D0%BB%D0%B8%D1%87%D0%BD%D0%BE%D1%81%D1%82%D0%B8_%D0%9A%D1%8D%D1%82%D1%82%D0%B5%D0%BB%D0%BB%D0%B0/%D0%9A%D0%BB%D1%8E%D1%87_%D0%BA_%D0%BC%D0%B5%D1%82%D0%BE%D0%B4%D0%B8%D0%BA%D0%B5_%D0%9A%D1%8D%D1%82%D1%82%D0%B5%D0%BB%D0%BB%D0%B0_(%D1%84%D0%BE%D1%80%D0%BC%D0%B0_A)';

https.get(url, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    fs.writeFileSync('psylab.html', body);
    console.log('Saved to psylab.html');
  });

}).on('error', (e) => {
  console.error("Got error: " + e.message);
});
