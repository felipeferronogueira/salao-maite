// app.js
require('dotenv').config(); // ✅ Isso tem que vir primeiro

const express = require('express');
const path = require('path');
const routes = require('./src/routes');

const app = express();
const PORT = 3000;

app.use(express.json());

// Servir arquivos estáticos (HTML, CSS, JS) da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API (backend)
app.use('/api', routes);

// Redireciona para a página de login ao acessar /
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
