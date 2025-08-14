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

router.post('/cadastro', async (req, res) => {
  const { nome, telefone, obs } = req.body;

  if (!nome || !telefone || !obs) {
    return res.status(400).json({ error: 'Nome, telefone e observação são obrigatórios' });
  }

  // 🔍 Verifica se já existe uma cliente com o mesmo nome
  const { data: clienteExistente, error: erroBusca } = await supabase
    .from('cliente')
    .select('*')
    .eq('nome', nome)
    .single(); // espera no máximo um resultado

  if (erroBusca && erroBusca.code !== 'PGRST116') {
    // PGRST116 = no rows found, isso é ok
    return res.status(500).json({ error: 'Erro ao buscar cliente existente' });
  }

  if (clienteExistente) {
    return res.status(409).json({ error: 'Cliente já cadastrada com esse nome' });
  }

  // ✅ Cadastra novo cliente
  const { data, error } = await supabase
    .from('cliente')
    .insert([{ nome, telefone, obs }]);

  if (error) {
    return res.status(500).json({ error: 'Erro ao inserir no banco de dados' });
  }

  res.status(201).json({ message: 'Cliente cadastrada com sucesso', data });
});

// Busca cliente por ID
router.get('/cliente/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('cliente')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// Atualiza cliente por ID
router.put('/cliente/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, obs } = req.body;

  if (!nome || !telefone || !obs) {
    return res.status(400).json({ error: 'Nome, telefone e observação são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('cliente')
      .update({ nome, telefone, obs })
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Cliente atualizado com sucesso', data });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
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
      .eq('status', false);

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
      if (diffDias >= 7) {
        alertas.push({
          tipo: 'Satisfação',
          mensagem: `📞 Perguntar para ${cliente.nome} (tel: ${cliente.telefone}) se ela está gostando do serviço ${servicoNome}, realizado em ${atendimento.data} ${textoTempo}.`,
          atendimento_id: atendimento.id
        });
      }

      // Tonalização (serviço 3) - prazo: 60 dias
      const tonalizacaoPrazo = 60;
      if (servicoId === 3 && diffDias >= tonalizacaoPrazo - 7) {
        const passou = diffDias > tonalizacaoPrazo
          ? `O prazo venceu há ${diffDias - tonalizacaoPrazo} dias.`
          : `Faltam ${tonalizacaoPrazo - diffDias} dias para o prazo.`;

        alertas.push({
          tipo: 'Tonalização',
          mensagem: `🎨 Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer uma nova tonalização. A última foi em ${atendimento.data} ${textoTempo}. ${passou}`,
          atendimento_id: atendimento.id
        });
      }

      // Reflexo (serviço 4) - prazo: 120 dias
      const reflexoPrazo = 120;
      if (servicoId === 4 && diffDias >= reflexoPrazo - 7) {
        const passou = diffDias > reflexoPrazo
          ? `O prazo venceu há ${diffDias - reflexoPrazo} dias.`
          : `Faltam ${reflexoPrazo - diffDias} dias para o prazo.`;

        alertas.push({
          tipo: 'Reflexo',
          mensagem: `🔄 Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer novo reflexo. A última vez foi em ${atendimento.data} ${textoTempo}. ${passou}`,
          atendimento_id: atendimento.id
        });
      }

      // Corte (serviço 1) - prazo: 90 dias
      const cortePrazo = 90;
      if (servicoId === 1 && diffDias >= cortePrazo - 7) {
        const passou = diffDias > cortePrazo
          ? `O prazo venceu há ${diffDias - cortePrazo} dias.`
          : `Faltam ${cortePrazo - diffDias} dias para o prazo.`;

        alertas.push({
          tipo: 'Novo Corte',
          mensagem: `💇‍♀️ Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer novo corte. O último foi em ${atendimento.data} ${textoTempo}. ${passou}`,
          atendimento_id: atendimento.id
        });
      }

      // Coloração (serviço 2) com prazo personalizado
      if (servicoId === 2 && atendimento.prazo_retorno) {
        const prazo = parseInt(atendimento.prazo_retorno);
        const inicio = prazo - 7;

        if (diffDias >= inicio) {
          const passou = diffDias > prazo
            ? `O prazo venceu há ${diffDias - prazo} dias.`
            : `Faltam ${prazo - diffDias} dias para o prazo.`;

          alertas.push({
            tipo: 'Coloração',
            mensagem: `🌈 Sugerir para ${cliente.nome} (tel: ${cliente.telefone}) fazer uma nova coloração. A última foi em ${atendimento.data} ${textoTempo}. ${passou}`,
            atendimento_id: atendimento.id
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

router.put('/alertas/resolver/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('atendimento')
      .update({ status: true })
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({ message: 'Alerta resolvido com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ error: 'Erro ao resolver alerta' });
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

router.put('/atendimento/:id', async (req, res) => {
  const { id } = req.params;
  const { cliente_id, servico, preco, data, marca, quantidade, cor, prazo } = req.body;

  try {
    const { error } = await supabase
      .from('atendimento')
      .update({
        fk_cliente: cliente_id,
        fk_servico: servico,
        preco,
        data,
        marca: marca || null,
        quantidade_uso: quantidade || null,
        numero_cor: cor || null,
        prazo_retorno: prazo || null
      })
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({ message: 'Atendimento atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar atendimento:', err);
    res.status(500).json({ error: 'Erro ao atualizar atendimento' });
  }
});

router.get('/historico/:clienteId', async (req, res) => {
  const { clienteId } = req.params;

  try {
    const { data, error } = await supabase
      .from('atendimento')
      .select(`
        id, data, preco, marca, quantidade_uso, numero_cor, prazo_retorno,
        cliente (nome, telefone, obs), 
        servico (id, nome)
      `)
      .eq('fk_cliente', clienteId)
      .order('data', { ascending: false });

    if (error) throw error;

    const historico = data.map(item => ({
      id: item.id,
      servico: item.servico.nome,
      servico_id: item.servico.id,
      cliente: item.cliente.nome,
      telefone: item.cliente.telefone,
      obs: item.cliente.obs,
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

const ExcelJS = require('exceljs');

router.get('/exportar-atendimentos', async (req, res) => {
  try {
    const { inicio, fim } = req.query;

    if (!inicio || !fim) {
      return res.status(400).json({ error: 'Datas de início e fim são obrigatórias.' });
    }

    const { data, error } = await supabase
      .from('atendimento')
      .select(`
        data, preco, marca, quantidade_uso, numero_cor,
        cliente (nome, telefone, obs),
        servico (nome)
      `)
      .gte('data', inicio)
      .lte('data', fim);

    if (error) throw error;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Atendimentos');

    // Cabeçalhos com OBS após PREÇO
    worksheet.columns = [
      { header: 'Data', key: 'data', width: 20 },
      { header: 'Cliente', key: 'nome_cliente', width: 25 },
      { header: 'Telefone', key: 'telefone_cliente', width: 18 },
      { header: 'Serviço', key: 'servico', width: 20 },
      { header: 'Preço', key: 'preco', width: 10 },
      { header: 'Observação', key: 'obs', width: 30 },
      { header: 'Marca', key: 'marca', width: 20 },
      { header: 'Qtd. Uso', key: 'quantidade_uso', width: 12 },
      { header: 'Nº Cor', key: 'numero_cor', width: 10 }
    ];

    // Dados
    data.forEach(item => {
      worksheet.addRow({
        data: item.data,
        nome_cliente: item.cliente?.nome || '',
        telefone_cliente: item.cliente?.telefone || '',
        servico: item.servico?.nome || '',
        preco: item.preco,
        obs: item.cliente?.obs || '',
        marca: item.marca || '',
        quantidade_uso: item.quantidade_uso || '',
        numero_cor: item.numero_cor || ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=atendimentos.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Erro ao exportar atendimentos:', err);
    res.status(500).json({ error: 'Erro ao exportar atendimentos' });
  }
});


module.exports = router;
