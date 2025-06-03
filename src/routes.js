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
    const { data: atendimentos, error: errorAtend } = await supabase
      .from('atendimento')
      .select(`
        *,
        cliente (id, nome, telefone),
        servico (id, nome)
      `)
      .order('data', { ascending: false });

    if (errorAtend) throw errorAtend;

    const hoje = new Date();
    const alertas = [];

    // Função para formatar data corretamente
    function formatarDataUTC(dataString) {
      const data = new Date(dataString);
      return `${data.getUTCDate().toString().padStart(2, '0')}/${(data.getUTCMonth() + 1).toString().padStart(2, '0')}/${data.getUTCFullYear()}`;
    }

    // Função para calcular diferença em meses e dias
    function diferencaMesesDias(data) {
      const hojeDate = new Date(hoje);
      const dataRef = new Date(data);

      let anos = hojeDate.getFullYear() - dataRef.getFullYear();
      let meses = hojeDate.getMonth() - dataRef.getMonth();
      let dias = hojeDate.getDate() - dataRef.getDate();

      if (dias < 0) {
        meses--;
        const ultimoDiaMesAnterior = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 0).getDate();
        dias += ultimoDiaMesAnterior;
      }

      if (meses < 0) {
        anos--;
        meses += 12;
      }

      meses += anos * 12;

      return { meses, dias };
    }

    for (const atendimento of atendimentos) {
      const dataAtendimento = new Date(atendimento.data);
      const cliente = atendimento.cliente;
      const servicoId = atendimento.fk_servico;
      const servicoNome = atendimento.servico.nome;

      const diffDias = Math.floor(
        (hoje.getTime() - dataAtendimento.getTime()) / (1000 * 60 * 60 * 24)
      );

      const { meses, dias } = diferencaMesesDias(atendimento.data);

      const textoTempo = `(${meses} meses e ${dias} dias atrás)`;

      // ✅ Satisfação (7 a 13 dias)
      if (diffDias >= 7 && diffDias <= 13) {
        alertas.push({
          tipo: 'Satisfação',
          mensagem: `📞 Perguntar para ${cliente.nome} (tel: ${cliente.telefone}) se ela está gostando do serviço ${servicoNome}, realizado em ${formatarDataUTC(atendimento.data)} ${textoTempo}.`
        });
      }

      // ⚙️ Outros alertas
      if (servicoId === 3) {
        // Reflexo -> Tonalização (60 dias), alerta 7 dias antes e até 7 dias depois
        const prazo = 60;
        const alertaComeca = prazo - 7;
        const alertaTermina = prazo + 7;

        if (diffDias >= alertaComeca && diffDias <= alertaTermina) {
          const passou = diffDias > prazo ? `O prazo venceu há ${diffDias - prazo} dias.` : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Tonalização',
            mensagem: `🎨 Oferecer para ${cliente.nome} (tel: ${cliente.telefone}) uma tonalização, pois o reflexo foi feito em ${formatarDataUTC(atendimento.data)} ${textoTempo}. ${passou}`
          });
        }
      }

      if (servicoId === 4) {
        // Tonalização -> Reflexo (120 dias), alerta 7 dias antes e até 7 dias depois
        const prazo = 120;
        const alertaComeca = prazo - 7;
        const alertaTermina = prazo + 7;

        if (diffDias >= alertaComeca && diffDias <= alertaTermina) {
          const passou = diffDias > prazo ? `O prazo venceu há ${diffDias - prazo} dias.` : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Reflexo',
            mensagem: `🔄 Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer reflexo, pois o último tonalizar/tratar foi em ${formatarDataUTC(atendimento.data)} ${textoTempo}. ${passou}`
          });
        }
      }

      if (servicoId === 1) {
        // Corte -> Novo Corte (90 dias), alerta 7 dias antes e até 7 dias depois
        const prazo = 90;
        const alertaComeca = prazo - 7;
        const alertaTermina = prazo + 7;

        if (diffDias >= alertaComeca && diffDias <= alertaTermina) {
          const passou = diffDias > prazo ? `O prazo venceu há ${diffDias - prazo} dias.` : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Novo Corte',
            mensagem: `💇‍♀️ Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer novo corte, pois o último corte foi em ${formatarDataUTC(atendimento.data)} ${textoTempo}. ${passou}`
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
