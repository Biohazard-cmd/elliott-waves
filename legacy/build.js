// Собирает один самодостаточный HTML: node build.js
const fs = require('fs');
const engine = fs.readFileSync(__dirname + '/engine.js', 'utf8');
const app = fs.readFileSync(__dirname + '/app.html', 'utf8');
fs.mkdirSync(__dirname + '/dist', { recursive: true });
fs.writeFileSync(__dirname + '/dist/elliott-advisor.html', app.replace('/*__ENGINE__*/', () => engine));
console.log('dist/elliott-advisor.html', fs.statSync(__dirname + '/dist/elliott-advisor.html').size, 'bytes');
