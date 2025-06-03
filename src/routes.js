const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { DateTime } = require('luxon'); // ⬅️ Importando luxon

const router = express.Router();

// 🔗 Configuração do Supabase
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



// Função para calcular a diferença em meses e dias
function diferencaMesesDias(dataString, hojeBrasilia) {
  const data = DateTime.fromISO(dataString, { zone: 'utc' }).setZone('America/Sao_Paulo');
  const diff = hojeBrasilia.diff(data, ['months', 'days']).toObject();

  return {
    meses: Math.floor(diff.months),
    dias: Math.floor(diff.days),
  };
}

// Rota principal
router.get('/alertas', async (req, res) => {
  try {
    const { data: atendimentos, error } = await supabase
      .from('atendimento')
      .select(`
        *,
        cliente (id, nome, telefone),
        servico (id, nome)
      `)
      .order('data', { ascending: false });

    if (error) throw error;

    const hojeBrasilia = DateTime.now().setZone('America/Sao_Paulo');
    const alertas = [];

    for (const atendimento of atendimentos) {
      console.log(`Data bruta do atendimento (ID: ${atendimento.id}):`, atendimento.data);

      const dataAtendimento = DateTime.fromISO(atendimento.data, { zone: 'utc' }).setZone('America/Sao_Paulo');
      console.log(`Data ajustada para Brasília:`, dataAtendimento.toISO());

      const cliente = atendimento.cliente;
      const servicoId = atendimento.fk_servico;
      const servicoNome = atendimento.servico.nome;

      const diffDias = Math.floor(hojeBrasilia.diff(dataAtendimento, 'days').days);
      const { meses, dias } = diferencaMesesDias(atendimento.data, hojeBrasilia);
      const textoTempo = `(${meses} meses e ${dias} dias atrás)`;

      // Alerta de Satisfação
      if (diffDias >= 7 && diffDias <= 13) {
        alertas.push({
          tipo: 'Satisfação',
          mensagem: `📞 Perguntar para ${cliente.nome} (tel: ${cliente.telefone}) se ela está gostando do serviço ${servicoNome}, realizado em ${atendimento.data} ${textoTempo}.`
        });
      }

      // Tonalização (serviço 3)
      if (servicoId === 3) {
        const prazo = 60;
        const inicio = prazo - 7;
        const fim = prazo + 7;

        if (diffDias >= inicio && diffDias <= fim) {
          const passou = diffDias > prazo
            ? `O prazo venceu há ${diffDias - prazo} dias.`
            : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Tonalização',
            mensagem: `🎨 Oferecer para ${cliente.nome} (tel: ${cliente.telefone}) uma tonalização, pois o reflexo foi feito em ${atendimento.data} ${textoTempo}. ${passou}`
          });
        }
      }

      // Reflexo (serviço 4)
      if (servicoId === 4) {
        const prazo = 120;
        const inicio = prazo - 7;
        const fim = prazo + 7;

        if (diffDias >= inicio && diffDias <= fim) {
          const passou = diffDias > prazo
            ? `O prazo venceu há ${diffDias - prazo} dias.`
            : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Reflexo',
            mensagem: `🔄 Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer reflexo, pois o último tonalizar/tratar foi em ${atendimento.data} ${textoTempo}. ${passou}`
          });
        }
      }

      // Corte (serviço 1)
      if (servicoId === 1) {
        const prazo = 90;
        const inicio = prazo - 7;
        const fim = prazo + 7;

        if (diffDias >= inicio && diffDias <= fim) {
          const passou = diffDias > prazo
            ? `O prazo venceu há ${diffDias - prazo} dias.`
            : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Novo Corte',
            mensagem: `💇‍♀️ Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer novo corte, pois o último corte foi em ${atendimento.data} ${textoTempo}. ${passou}`
          });
        }
      }
    }

    res.status(200).json({ alertas });

  } catch (err) {
    console.error('Erro ao gerar alertas:', err);
    res.status(500).json({ error: 'Erro ao gerar alertas' });
  }
});

module.exports = router;