const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { DateTime } = require('luxon');

const router = express.Router();

// Configuração do Supabase com variáveis de ambiente (recomenda-se usar .env)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
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

// Rota para cadastrar novo cliente
router.post('/cadastro', async (req, res) => {
  const { nome, telefone } = req.body;

  if (!nome || !telefone) {
    return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
  }

  const { data, error } = await supabase
    .from('cliente')
    .insert([{ nome, telefone }]);

  if (error) {
    return res.status(500).json({ error: 'Erro ao inserir no banco de dados' });
  }

  res.status(201).json({ message: 'Cliente cadastrado com sucesso', data });
});


// 📅 Função para calcular meses e dias entre hoje e a data
function diferencaMesesDias(dataString) {
  const hoje = DateTime.now().setZone('America/Sao_Paulo');
  const data = DateTime.fromISO(dataString, { zone: 'utc' }).setZone('America/Sao_Paulo');
  const diff = hoje.diff(data, ['months', 'days']).toObject();

  return {
    meses: Math.floor(diff.months),
    dias: Math.floor(diff.days),
  };
}

// 🔁 Função para gerar alerta com base no tipo e prazo
function gerarAlerta(tipo, atendimento, cliente, servicoNome, diffDias, servicoAlvo, prazo, emoji) {
  const inicio = prazo - 7;
  const fim = prazo + 7;

  if (atendimento.fk_servico === servicoAlvo && diffDias >= inicio && diffDias <= fim) {
    const passou = diffDias > prazo
      ? `O prazo venceu há ${diffDias - prazo} dias.`
      : `Faltam ${prazo - diffDias} dias para o prazo.`;

    const { meses, dias } = diferencaMesesDias(atendimento.data);

    return {
      tipo,
      mensagem: `${emoji} Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer ${tipo.toLowerCase()}, pois o último foi em ${atendimento.data} (${meses} meses e ${dias} dias atrás). ${passou}`
    };
  }

  return null;
}

// 📣 Rota principal para alertas
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

    const hoje = DateTime.now().setZone('America/Sao_Paulo');
    const alertas = [];

    for (const atendimento of atendimentos) {
      const dataAtendimento = DateTime.fromISO(atendimento.data, { zone: 'utc' }).setZone('America/Sao_Paulo');
      const diffDias = Math.floor(hoje.diff(dataAtendimento, 'days').days);

      const { cliente, servico, fk_servico: servicoId } = atendimento;
      const servicoNome = servico.nome;
      const { meses, dias } = diferencaMesesDias(atendimento.data);
      const textoTempo = `(${meses} meses e ${dias} dias atrás)`;

      // Alerta de Satisfação
      if (diffDias >= 7 && diffDias <= 13) {
        alertas.push({
          tipo: 'Satisfação',
          mensagem: `📞 Perguntar para ${cliente.nome} (tel: ${cliente.telefone}) se ela está gostando do serviço ${servicoNome}, realizado em ${atendimento.data} ${textoTempo}.`
        });
      }

      // Tonalização (serviço 3)
      const tonalizacao = gerarAlerta('Tonalização', atendimento, cliente, servicoNome, diffDias, 3, 60, '🎨');
      if (tonalizacao) alertas.push(tonalizacao);

      // Reflexo (serviço 4)
      const reflexo = gerarAlerta('Reflexo', atendimento, cliente, servicoNome, diffDias, 4, 120, '🔄');
      if (reflexo) alertas.push(reflexo);

      // Corte (serviço 1)
      const corte = gerarAlerta('Novo Corte', atendimento, cliente, servicoNome, diffDias, 1, 90, '💇‍♀️');
      if (corte) alertas.push(corte);

      // 💡 Coloração com prazo personalizado (serviço 2)
      if (servicoId === 2 && atendimento.prazo_retorno) {
        const prazo = parseInt(atendimento.prazo_retorno);
        const inicio = prazo - 7;
        const fim = prazo + 7;

        if (diffDias >= inicio && diffDias <= fim) {
          const passou = diffDias > prazo
            ? `O prazo venceu há ${diffDias - prazo} dias.`
            : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Coloração',
            mensagem: `🌈 Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer uma nova coloração. A última foi em ${atendimento.data} ${textoTempo}. ${passou}`
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

router.get('/clientes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cliente')
      .select('id, nome');

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

router.post('/atendimento', async (req, res) => {
  const { cliente_id, servico, preco, data, marca, quantidade, cor, prazo } = req.body;

  try {
    const { error } = await supabase.from('atendimento').insert({
      fk_cliente: cliente_id,
      fk_servico: servico,
      preco,
      data,
      marca: marca || null,
      quantidade_uso: quantidade || null,
      numero_cor: cor || null,
      prazo_retorno: prazo || null
    });

    if (error) throw error;

    res.status(201).json({ message: 'Atendimento cadastrado' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar atendimento' });
  }
});

router.get('/historico/:clienteId', async (req, res) => {
  const { clienteId } = req.params;

  try {
    const { data, error } = await supabase
      .from('atendimento')
      .select(`
        id, data, preco, marca, quantidade_uso, numero_cor, prazo_retorno,
        cliente (nome, telefone), 
        servico (id, nome)
      `)
      .eq('fk_cliente', clienteId)
      .order('data', { ascending: false });

    if (error) throw error;

    const historico = data.map(item => ({
      servico: item.servico.nome,
      servico_id: item.servico.id,
      cliente: item.cliente.nome,
      telefone: item.cliente.telefone,
      data: item.data,
      preco: item.preco,
      marca: item.marca || null,
      quantidade: item.quantidade_uso || null,
      numero_cor: item.numero_cor || null,
      prazo_retorno: item.prazo_retorno || null
    }));

    res.status(200).json(historico);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

const { Parser } = require('json2csv');

router.get('/exportar-atendimentos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('atendimento')
      .select(`
        data, preco, marca, quantidade_uso, numero_cor,
        cliente (nome, telefone),
        servico (nome)
      `);

    if (error) throw error;

    const atendimentos = data.map(item => ({
      data: item.data,
      nome_cliente: item.cliente?.nome || '',
      telefone_cliente: item.cliente?.telefone || '',
      servico: item.servico?.nome || '',
      preco: item.preco,
      marca: item.marca || '',
      quantidade_uso: item.quantidade_uso || '',
      numero_cor: item.numero_cor || ''
    }));

    const fields = [
      'data',
      'nome_cliente',
      'telefone_cliente',
      'servico',
      'preco',
      'marca',
      'quantidade_uso',
      'numero_cor'
    ];

    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(atendimentos);

    // Adiciona o BOM para Excel reconhecer UTF-8 corretamente
    const bom = '\uFEFF';

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('atendimentos.csv');
    return res.send(bom + csv);
  } catch (err) {
    console.error('Erro ao exportar atendimentos:', err);
    res.status(500).json({ error: 'Erro ao exportar atendimentos' });
  }
});


module.exports = router;
