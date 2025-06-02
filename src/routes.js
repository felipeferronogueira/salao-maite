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

// 🔔 Rota para gerar alertas
router.get('/alertas', async (req, res) => {
  try {
    // Puxa todos os atendimentos, ordenados por data (mais recente primeiro)
    const { data: atendimentos, error: errorAtend } = await supabase
      .from('atendimento')
      .select(`
        *,
        cliente (id, nome, telefone),
        servico (id, nome)
      `)
      .order('data', { ascending: false });

    if (errorAtend) throw errorAtend;

    // Objeto para guardar o último atendimento de cada cliente
    const ultimosAtendimentos = {};

    atendimentos.forEach(atendimento => {
      const clienteId = atendimento.fk_cliente;
      if (!ultimosAtendimentos[clienteId]) {
        ultimosAtendimentos[clienteId] = atendimento;
      }
    });

    const hoje = new Date();
    const alertas = [];

    for (const clienteId in ultimosAtendimentos) {
      const atendimento = ultimosAtendimentos[clienteId];
      const dataAtendimento = new Date(atendimento.data);
      const cliente = atendimento.cliente;
      const servicoId = atendimento.fk_servico;
      const servicoNome = atendimento.servico.nome;

      const diffDias = Math.floor((hoje - dataAtendimento) / (1000 * 60 * 60 * 24));

      // 🔹 Alerta de satisfação (1 semana após)
      if (diffDias === 7) {
        alertas.push({
          tipo: 'Satisfação',
          mensagem: `📞 Perguntar para ${cliente.nome} (tel: ${cliente.telefone}) se ela está gostando do serviço ${servicoNome}, realizado em ${dataAtendimento.toLocaleDateString()}.`
        });
      }

      // 🔸 Alertas específicos por serviço
      if (servicoId === 3) {
        // Reflexo
        const diasParaTonalizar = 60 - 14; // 2 meses menos 2 semanas
        if (diffDias === diasParaTonalizar) {
          alertas.push({
            tipo: 'Tonalização',
            mensagem: `🎨 Oferecer para ${cliente.nome} (tel: ${cliente.telefone}) uma tonalização, pois o reflexo foi feito em ${dataAtendimento.toLocaleDateString()}.`
          });
        }
      } else if (servicoId === 4) {
        // Tonalização
        const diasParaReflexo = 120 - 14; // 4 meses menos 2 semanas
        if (diffDias === diasParaReflexo) {
          alertas.push({
            tipo: 'Reflexo',
            mensagem: `🔄 Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) voltar para fazer reflexo, pois a tonalização foi feita em ${dataAtendimento.toLocaleDateString()}.`
          });
        }
      } else if (servicoId === 1) {
        // Corte
        const diasParaNovoCorte = 90 - 14; // 3 meses menos 2 semanas
        if (diffDias === diasParaNovoCorte) {
          alertas.push({
            tipo: 'Novo Corte',
            mensagem: `💇‍♀️ Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) voltar para um novo corte. O último foi em ${dataAtendimento.toLocaleDateString()}.`
          });
        }
      }
    }

    res.status(200).json({ alertas });

  } catch (error) {
    console.error('Erro ao gerar alertas:', error);
    res.status(500).json({ error: 'Erro ao gerar alertas' });
  }
});


module.exports = router;
