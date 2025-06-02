const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Configure o Supabase
const supabaseUrl = 'https://ddaospzzqescbvloatyg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkYW9zcHp6cWVzY2J2bG9hdHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2OTcxNzMsImV4cCI6MjA2NDI3MzE3M30.WnDEqtTtdNqHcupMvjYipdaDotizg9WEHbMQGwJIYqQ';
const supabase = createClient(supabaseUrl, supabaseKey);

// 🔐 Rota de login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: senha,
  });

  if (error) {
    return res.status(400).json({ error: 'Email ou senha incorretos' });
  }

  res.status(200).json({ message: 'Login realizado com sucesso', data });
});

module.exports = router;
