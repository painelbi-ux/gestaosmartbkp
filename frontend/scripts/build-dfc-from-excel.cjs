/**
 * Gera estruturaDfcArvore.json a partir do "Estrutura DFC Só Aço.xlsx".
 * Reproduz fielmente a hierarquia e somatórios do arquivo Excel.
 *
 * Uso: node scripts/build-dfc-from-excel.cjs
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../src/pages/financeiro/dfc/estruturaDfcArvore.json');

// ─── helpers ───────────────────────────────────────────────────────────────

function A(id, nome, macro, codigo) {
  return { id, nome, tipo: 'A', macro, codigo: codigo || '', children: [] };
}
function S(id, nome, macro, codigo, children) {
  return { id: id || null, nome, tipo: 'S', macro: macro || '', codigo: codigo || '', children };
}

// ─── FLUXO OPERACIONAL ─────────────────────────────────────────────────────

const OPERACIONAL = 'OPERACIONAL';

// --- ENTRADAS ---

const receitasOperacionais = S(221, 'RECEITAS OPERACIONAIS', OPERACIONAL, '1.1', [
  A(2,   'Receitas de Vendas de Produto',  OPERACIONAL, '1.1.1'),
  A(3,   'Receitas de Vendas de Serviço',  OPERACIONAL, '1.1.2'),
]);

const deducoesReceita = S(377, 'DEDUÇÕES DA RECEITA', OPERACIONAL, '1.2', [
  A(262, 'Descontos Incondicionais',        OPERACIONAL, '1.2.1'),
  A(190, 'Cancelamento de Venda',           OPERACIONAL, '1.2.2'),
  A(346, 'Devolução à Clientes',            OPERACIONAL, '1.2.3'),
  A(316, 'Taxas adm de cartoes',            OPERACIONAL, '1.2.4'),
]);

const receitasNaoOperacionais = S(220, 'RECEITAS NÃO OPERACIONAIS', OPERACIONAL, '2', [
  A(396, 'Venda de Sucatas',                    OPERACIONAL, '2.1'),
  A(406, 'Venda de Materiais Obsoletos',        OPERACIONAL, '2.2'),
  A(407, 'Créditos Fiscais Recuperados',        OPERACIONAL, '2.3'),
  A(403, 'Créditos de Desbloqueios Judiciais',  OPERACIONAL, '2.4'),
  A(408, 'Indenizações Recebidas',              OPERACIONAL, '2.5'),
  A(409, 'Multas Contratuais Recebidas',        OPERACIONAL, '2.6'),
]);

const entradas = S(null, 'Entradas', OPERACIONAL, '', [
  receitasOperacionais,
  deducoesReceita,
  receitasNaoOperacionais,
]);

// --- SAÍDAS ---

const pessoalOperacional = S(420, 'DESPESAS COM PESSOAL OPERACIONAL', OPERACIONAL, '4.2', [
  A(336, 'Salários - Operacional',                   OPERACIONAL, '4.2.1'),
  A(413, '13º Salário - Operacional',                OPERACIONAL, '4.2.2'),
  A(39,  'Férias - Operacional',                     OPERACIONAL, '4.2.3'),
  A(180, 'Horas Extras - Operacional',               OPERACIONAL, '4.2.4'),
  A(171, 'Pensão Alimentícia',                       OPERACIONAL, '4.2.5'),
  A(194, 'Ajuda de Custo',                           OPERACIONAL, '4.2.6'),
  A(353, 'Vale Transporte - Operacional',            OPERACIONAL, '4.2.7'),
  A(354, 'Vale Alimentacao/Refeição - Operacional',  OPERACIONAL, '4.2.8'),
  A(357, 'Alimentação Hora Extra',                   OPERACIONAL, '4.2.9'),
  A(372, 'Bonificação Operacional',                  OPERACIONAL, '4.2.10'),
]);

const demaisGastosPessoalOp = S(421, 'DEMAIS GASTOS COM PESSOAL OPERACIONAL', OPERACIONAL, '4.3', [
  A(385, 'Auxílio Combustível - Operação',  OPERACIONAL, '4.3.1'),
  A(301, 'Contribuição Sindical',           OPERACIONAL, '4.3.2'),
  A(307, 'Saúde Ocupacional',               OPERACIONAL, '4.3.3'),
  A(49,  'Seguro de Vida',                  OPERACIONAL, '4.3.4'),
]);

const pessoalLogistica = S(428, 'DESPESAS COM PESSOAL LOGÍSTICA', OPERACIONAL, '4.8.1', [
  A(337, 'Salários Logística',              OPERACIONAL, '4.8.1.1'),
  A(414, '13º Salário - Logística',         OPERACIONAL, '4.8.1.2'),
  A(387, 'Férias - Logística',              OPERACIONAL, '4.8.1.3'),
  A(386, 'Auxílio Combustível - Logística', OPERACIONAL, '4.8.1.4'),
  A(328, 'Despesas de Viagens OP',          OPERACIONAL, '4.8.1.5'),
]);

const pessoalAdmin = S(431, 'DESPESAS COM PESSOAL ADMINISTRATIVO', OPERACIONAL, '5.1', [
  A(37,  'Salários',                                      OPERACIONAL, '5.1.1'),
  A(189, 'Adiantamentos a Colaboradores',                 OPERACIONAL, '5.1.2'),
  A(38,  '13º Salário',                                   OPERACIONAL, '5.1.3'),
  A(388, 'Férias - Administrativa',                       OPERACIONAL, '5.1.4'),
  A(374, 'Horas Extras - Administrativo',                 OPERACIONAL, '5.1.5'),
  A(43,  'FGTS',                                          OPERACIONAL, '5.1.6'),
  A(308, 'INSS',                                          OPERACIONAL, '5.1.7'),
  A(375, 'Vale Alimentacao/Refeição - Administrativo',    OPERACIONAL, '5.1.8'),
  A(376, 'Vale Transporte - Administrativo',              OPERACIONAL, '5.1.9'),
  A(53,  'Pro-labore',                                    OPERACIONAL, '5.1.10'),
]);

const pessoalAdminVariavel = S(432, 'DESPESAS VARIÁVEIS COM PESSOAL ADMINISTRATIVO', OPERACIONAL, '5.2', [
  A(52,  'Bolsa de Estágio',                          OPERACIONAL, '5.2.1'),
  A(327, 'Bonificação - Administrativo',              OPERACIONAL, '5.2.2'),
  A(384, 'Auxílio Combustível - Administrativo',      OPERACIONAL, '5.2.3'),
  A(48,  'Assistência Médica/Odontológica/Farmácia',  OPERACIONAL, '5.2.4'),
  A(373, 'Fardamento Administrativo',                 OPERACIONAL, '5.2.5'),
  A(356, 'Refeições Corporativas',                    OPERACIONAL, '5.2.6'),
]);

const despesasPessoal = S(null, 'DESPESAS COM PESSOAL', OPERACIONAL, '', [
  pessoalOperacional,
  demaisGastosPessoalOp,
  pessoalLogistica,
  pessoalAdmin,
  pessoalAdminVariavel,
]);

const fornecedores = S(223, 'FORNECEDORES', OPERACIONAL, '3', [
  A(149, 'Fornecedor - Material Revenda',  OPERACIONAL, '3.1.1'),
  A(25,  'Fornecedor - Materia Prima',     OPERACIONAL, '3.2.1'),
  A(26,  'Fornecedor - Material Embalagem',OPERACIONAL, '3.2.2'),
  A(253, 'Fornecedor - Material Insumos',  OPERACIONAL, '3.2.3'),
  A(254, 'Prestador de Serviços - Custo',  OPERACIONAL, '3.2.4'),
  A(24,  'Fretes - Mercadorias',           OPERACIONAL, '3.3.1'),
  A(276, 'Fretes e Carretos',              OPERACIONAL, '3.3.2'),
]);

const impostosVendas = S(391, 'IMPOSTOS SOBRE VENDAS', OPERACIONAL, '1.3', [
  A(8,   'ICMS s/vendas',               OPERACIONAL, '1.3.1'),
  A(349, 'COTAC',                       OPERACIONAL, '1.3.2'),
  A(382, 'FECOP',                       OPERACIONAL, '1.3.3'),
  A(13,  'Simples Nacional',            OPERACIONAL, '1.3.4'),
  A(310, 'ICMS Antecipado',             OPERACIONAL, '1.3.5'),
  A(137, 'ICMS Substituição Tributária',OPERACIONAL, '1.3.6'),
  A(350, 'ICMS Difal',                  OPERACIONAL, '1.3.7'),
  A(6,   'PIS s/vendas',                OPERACIONAL, '1.3.8'),
  A(7,   'COFINS s/vendas',             OPERACIONAL, '1.3.9'),
  A(9,   'IPI s/vendas',                OPERACIONAL, '1.3.10'),
  A(10,  'ISS s/vendas',                OPERACIONAL, '1.3.11'),
  A(348, 'FUNEF',                       OPERACIONAL, '1.3.12'),
]);

const impostosLucro = S(448, 'IMPOSTOS SOBRE O LUCRO', OPERACIONAL, '9', [
  A(44,  'IRRF',  OPERACIONAL, '9.1'),
  A(12,  'CSLL',  OPERACIONAL, '9.2'),
  A(11,  'IRPJ',  OPERACIONAL, '9.3'),
]);

const despesasTributarias = S(null, 'DESPESAS TRIBUTÁRIAS', OPERACIONAL, '', [
  impostosVendas,
  impostosLucro,
]);

const energiaEletrica = S(419, 'ENERGIA ELÉTRICA', OPERACIONAL, '4.1', [
  A(304, 'Energia Elétrica', OPERACIONAL, '4.1.1'),
]);

const servicosTerceirizadosProd = S(422, 'SERVIÇOS TERCEIRIZADOS DA PRODUÇÃO', OPERACIONAL, '4.4', [
  A(342, 'Análises e Inspeções Técnicas',          OPERACIONAL, '4.4.1'),
  A(365, 'Alugueis de Equipamentos Produção',      OPERACIONAL, '4.4.2'),
  A(370, 'Serviços Terceirizados de Produção',     OPERACIONAL, '4.4.3'),
]);

const episUniformes = S(424, 'EPIS E UNIFORMES', OPERACIONAL, '4.6', [
  A(93, 'EPI',       OPERACIONAL, '4.6.1'),
  A(92, 'Fardamento',OPERACIONAL, '4.6.2'),
]);

const desenvolvColaboradores = S(423, 'DESENVOLVIMENTO DE COLABORADORES', OPERACIONAL, '4.5', [
  A(67,  'Treinamentos e Certificações', OPERACIONAL, '4.5.1'),
  episUniformes,
]);

const mecanicaManutencoes = S(426, 'MECÂNICA E MANUTENÇÕES INDUSTRIAIS', OPERACIONAL, '4.7.1', [
  A(389, 'Serviços de Manutenção Industrial',  OPERACIONAL, '4.7.1.1'),
  A(390, 'Materiais de Manutenção Industrial', OPERACIONAL, '4.7.1.2'),
  A(104, 'Calibração de Instrumentos',         OPERACIONAL, '4.7.1.3'),
  A(352, 'Peças e Ferramentas',                OPERACIONAL, '4.7.1.4'),
]);

const manutencaoFrota = S(429, 'MANUTENÇÃO DE FROTA', OPERACIONAL, '4.8.2.5', [
  A(75,  'Materiais de Manutenção de Veículos', OPERACIONAL, '4.8.2.5.1'),
  A(274, 'Serviços de Manutenção de Veículos',  OPERACIONAL, '4.8.2.5.2'),
]);

const despesasFrota = S(243, 'DESPESAS COM FROTA', OPERACIONAL, '4.8.2', [
  A(74,  'Combustíveis e Lubrificantes',   OPERACIONAL, '4.8.2.1'),
  A(79,  'Multas de Trânsito',             OPERACIONAL, '4.8.2.2'),
  A(311, 'IPVA E Licenciamentos',          OPERACIONAL, '4.8.2.3'),
  A(361, 'Rastreamento de Veículos',       OPERACIONAL, '4.8.2.4'),
  manutencaoFrota,
]);

const despesasOperacionais = S(224, 'DESPESAS OPERACIONAIS', OPERACIONAL, '4', [
  energiaEletrica,
  servicosTerceirizadosProd,
  desenvolvColaboradores,
  mecanicaManutencoes,
  despesasFrota,
]);

const endomarketing = S(433, 'ENDOMARKETING', OPERACIONAL, '5.3', [
  A(364, 'Serviços para Eventos',    OPERACIONAL, '5.3.1'),
  A(368, 'Materiais para Eventos',   OPERACIONAL, '5.3.2'),
  A(369, 'Alimentação para Eventos', OPERACIONAL, '5.3.3'),
]);

const idenizacoes = S(434, 'IDENIZAÇÕES E RESCISÕES', OPERACIONAL, '5.4', [
  A(41,  'FGTS Multa Rescisória',   OPERACIONAL, '5.4.1'),
  A(40,  'Rescisões Trabalhistas',  OPERACIONAL, '5.4.2'),
  A(260, 'Indenizações',            OPERACIONAL, '5.4.3'),
]);

const despesasBurocraticas = S(435, 'DESPESAS BUROCRÁTICAS', OPERACIONAL, '5.5', [
  A(96,  'Correios e Malotes',             OPERACIONAL, '5.5.1'),
  A(341, 'Cartórios',                      OPERACIONAL, '5.5.2'),
  A(317, 'Taxas de Legalização',           OPERACIONAL, '5.5.3'),
  A(343, 'Multas Judiciais',               OPERACIONAL, '5.5.4'),
  A(366, 'Despachantes',                   OPERACIONAL, '5.5.5'),
  A(154, 'Laboratório, Análises e Pesquisas', OPERACIONAL, '5.5.6'),
  A(258, 'Laudos Ambientais',              OPERACIONAL, '5.5.7'),
]);

const despesasPrediais = S(392, 'DESPESAS PREDIAIS', OPERACIONAL, '5.6', [
  A(58,  'Alugueis',                       OPERACIONAL, '5.6.1'),
  A(300, 'IPTU e Condomínio',              OPERACIONAL, '5.6.2'),
  A(69,  'Segurança e Vigilância',         OPERACIONAL, '5.6.3'),
  A(61,  'Água e Tratamento de Efluentes', OPERACIONAL, '5.6.4'),
  A(271, 'Serviços de Manutenção Predial', OPERACIONAL, '5.6.5'),
  A(273, 'Materiais de Manutenção Predial',OPERACIONAL, '5.6.6'),
]);

const viagensLocomocoes = S(238, 'VIAGENS E LOCOMOÇÕES', OPERACIONAL, '5.7', [
  A(268, 'Hospedagem',              OPERACIONAL, '5.7.1'),
  A(84,  'Passagens Aéreas',        OPERACIONAL, '5.7.2'),
  A(95,  'Translados',              OPERACIONAL, '5.7.3'),
  A(86,  'Eventos Clientes Externos', OPERACIONAL, '5.7.4'),
]);

const despesasEscritorio = S(436, 'DESPESAS DE ESCRITÓRIO', OPERACIONAL, '5.8', [
  A(89,  'Material de Escritório',                 OPERACIONAL, '5.8.1'),
  A(313, 'Materiais de suprimentos de informatica',OPERACIONAL, '5.8.2'),
  A(362, 'Despesas Gráficas',                      OPERACIONAL, '5.8.3'),
  A(363, 'Despesas Holding',                       OPERACIONAL, '5.8.4'),
  A(280, 'Alugueis de Equipamentos',               OPERACIONAL, '5.8.5'),
]);

const linhasRedes = S(437, 'LINHAS E REDES', OPERACIONAL, '5.9', [
  A(367, 'Internet',       OPERACIONAL, '5.9.1'),
  A(55,  'Telefonia Celular', OPERACIONAL, '5.9.2'),
  A(285, 'Telefonia Fixa', OPERACIONAL, '5.9.3'),
]);

const copasGerais = S(438, 'COPAS E GERAIS', OPERACIONAL, '5.10', [
  A(281, 'Copa e Cozinha',           OPERACIONAL, '5.10.1'),
  A(358, 'Higienização e Detetização', OPERACIONAL, '5.10.2'),
  A(90,  'Material de Limpeza',      OPERACIONAL, '5.10.3'),
]);

const softwares = S(439, 'SOFTWARES', OPERACIONAL, '5.11', [
  A(62,  'Manutenção Licença de Software', OPERACIONAL, '5.11.1'),
  A(326, 'Software Gestão',               OPERACIONAL, '5.11.2'),
]);

const demaisDespAdmin = S(440, 'DEMAIS DESPESAS ADMINISTRATIVAS', OPERACIONAL, '5.12', [
  A(278, 'Programa de Formação Profissional', OPERACIONAL, '5.12.1'),
  A(77,  'Seguros',           OPERACIONAL, '5.12.2'),
  A(277, 'Ações Sociais',     OPERACIONAL, '5.12.3'),
  A(345, 'Gastos com Animais',OPERACIONAL, '5.12.4'),
]);

const despesasAdministrativas = S(430, 'DESPESAS ADMINISTRATIVAS', OPERACIONAL, '5', [
  endomarketing,
  idenizacoes,
  despesasBurocraticas,
  despesasPrediais,
  viagensLocomocoes,
  despesasEscritorio,
  linhasRedes,
  copasGerais,
  softwares,
  demaisDespAdmin,
]);

const anunciosComerciais = S(442, 'ANUNCIOS COMERCIAIS', OPERACIONAL, '6.1', [
  A(256, 'Anúncios e Publicações',          OPERACIONAL, '6.1.2'),
  A(191, 'Aluguel de maquineta de cartão',  OPERACIONAL, '6.1.3'),
]);

const relacionamentos = S(443, 'RELACIONAMENTOS', OPERACIONAL, '6.2', [
  A(85,  'Brindes',               OPERACIONAL, '6.2.1'),
  A(329, 'Parcerias Comerciais',  OPERACIONAL, '6.2.2'),
]);

const comissoesBonificacoes = S(444, 'COMISSÕES E BONIFICAÇÕES', OPERACIONAL, '6.3', [
  A(23, 'Comissão Sobre Vendas', OPERACIONAL, '6.3.1'),
]);

const despesasComerciais = S(441, 'DESPESAS COMERCIAIS', OPERACIONAL, '6', [
  anunciosComerciais,
  relacionamentos,
  comissoesBonificacoes,
]);

const assessoriaJuridica = S(395, 'ASSESSORIA JURÍDICA', OPERACIONAL, '7.1', [
  A(65,  'Assessoria Juridica',         OPERACIONAL, '7.1.1'),
  A(297, 'Despesas Legais e Judiciais', OPERACIONAL, '7.1.2'),
]);

const consultoriaGestao = S(393, 'CONSULTORIA E ASSESSORIA EM GESTÃO', OPERACIONAL, '7.2', [
  A(66, 'Assessoria e Consultoria', OPERACIONAL, '7.2.1'),
]);

const marketingPublicidade = S(237, 'MARKETING E PUBICIDADE', OPERACIONAL, '7.3', [
  A(261, 'Assessoria de Marketing e Publicidade', OPERACIONAL, '7.3.1'),
  A(264, 'Material de Marketing e Publicidade',   OPERACIONAL, '7.3.2'),
]);

const assessoriaContabil = S(394, 'ASSESSORIA CONTÁBIL', OPERACIONAL, '7.4', [
  A(64, 'Assessoria Contábil', OPERACIONAL, '7.4.1'),
]);

const demaisServTerceirizados = S(445, 'DEMAIS SERVIÇOS TERCEIRIZADOS', OPERACIONAL, '7.5', [
  A(360, 'Assistência Técnica',    OPERACIONAL, '7.5.1'),
  A(359, 'Coleta de Lixo',         OPERACIONAL, '7.5.2'),
  A(100, 'Manutenção de Hardware', OPERACIONAL, '7.5.3'),
]);

const servicosTerceirizados = S(245, 'SERVIÇOS TERCEIRIZADOS', OPERACIONAL, '7', [
  assessoriaJuridica,
  consultoriaGestao,
  marketingPublicidade,
  assessoriaContabil,
  demaisServTerceirizados,
]);

const distribuicaoLucros = S(449, 'DISTRIBUIÇÃO DE LUCROS', OPERACIONAL, '10', [
  A(415, 'PLR',                          OPERACIONAL, '10.1'),
  A(325, 'Distribuição de Lucro a Sócios', OPERACIONAL, '10.2'),
]);

const endividamento = S(228, 'ENDIVIDAMENTO', OPERACIONAL, '12', [
  A(289, 'Dívida Bancária Principal',    OPERACIONAL, '12.1'),
  A(371, 'Dívida Bancária Juros',        OPERACIONAL, '12.2'),
  A(296, 'Dívida Clientes',             OPERACIONAL, '12.3'),
  A(290, 'Dívida Estadual',             OPERACIONAL, '12.4'),
  A(291, 'Dívida Federal',              OPERACIONAL, '12.5'),
  A(292, 'Dívida Fornecedores - Principal', OPERACIONAL, '12.6'),
  A(339, 'Dívida Fornecedores - Juros', OPERACIONAL, '12.7'),
  A(293, 'Dívida Municipal',            OPERACIONAL, '12.8'),
  A(294, 'Dívida Trabalhista',          OPERACIONAL, '12.9'),
]);

const saidas = S(null, 'Saídas', OPERACIONAL, '', [
  despesasPessoal,
  fornecedores,
  despesasTributarias,
  despesasOperacionais,
  despesasAdministrativas,
  despesasComerciais,
  servicosTerceirizados,
  distribuicaoLucros,
  endividamento,
]);

const fluxoOperacional = S(null, 'Fluxo Operacional', OPERACIONAL, '', [
  entradas,
  saidas,
]);

// ─── FLUXO FINANCEIRO ──────────────────────────────────────────────────────

const FIN = 'FINANCIAMENTOS';

const receitasFinanceiras = S(447, 'RECEITAS FINANCEIRAS', FIN, '8.1', [
  A(324, 'Captações de Empréstimos e Financiamentos', FIN, '8.1.1'),
  A(319, 'Emprestimos de Sócios',                     FIN, '8.1.2'),
  A(120, 'Captações de Empréstimos de Sócios',        FIN, '8.1.3'),
  A(231, 'Descontos Obtidos',                         FIN, '8.1.4'),
  A(234, 'Juros Auferidos',                           FIN, '8.1.5'),
  A(125, 'Rendimento de Aplicações Financeiras',      FIN, '8.1.6'),
  A(340, 'Crédito de Conta Garantida',                FIN, '8.1.7'),
  A(405, 'Recebimento de Crédito de Consórcios',      FIN, '8.1.8'),
]);

const despesasFinanceiras = S(318, 'DESPESAS FINANCEIRAS', FIN, '8.2', [
  A(315, 'Tarifas Bancarias',                             FIN, '8.2.1'),
  A(207, 'Tarifas de Custódia de Cheques',                FIN, '8.2.2'),
  A(344, 'IOF',                                           FIN, '8.2.3'),
  A(314, 'Principal de Empréstimos e Financiamentos',     FIN, '8.2.4'),
  A(321, 'Juros de Empréstimos e Financiamentos',         FIN, '8.2.5'),
  A(286, 'Juros e Encargos por Atraso',                   FIN, '8.2.6'),
  A(287, 'Juros e Taxas de Antecipação de Recebíveis',    FIN, '8.2.7'),
  A(107, 'Juros sobre Conta Garantida',                   FIN, '8.2.8'),
]);

const entradasFinanceiro = S(null, 'Entradas', FIN, '', [receitasFinanceiras]);
const saidasFinanceiro   = S(null, 'Saídas',   FIN, '', [despesasFinanceiras]);

const fluxoFinanceiro = S(null, 'Fluxo Financeiro', FIN, '', [
  entradasFinanceiro,
  saidasFinanceiro,
]);

// ─── FLUXO DE INVESTIMENTOS ────────────────────────────────────────────────

const INV = 'INVESTIMENTOS';

const vendaImobilizado = S(418, 'VENDA DE IMOBILIZADO', INV, '2.7', [
  A(410, 'Venda de Veículos',           INV, '2.7.2'),
  A(411, 'Venda de Máquinas/Equipamentos', INV, '2.7.3'),
  A(412, 'Venda de Imóveis',            INV, '2.7.4'),
]);

const aquisicaoAtivoImob = S(450, 'AQUISIÇÃO DE ATIVO IMOBILIZADO', INV, '11.1', [
  A(299, 'Aquisição de Veículos',             INV, '11.1.1'),
  A(416, 'Aquisição de Máquinas e Equipamentos', INV, '11.1.2'),
  A(417, 'Aquisição de Imóveis',              INV, '11.1.3'),
  A(155, 'Consórcio',                         INV, '11.1.4'),
]);

const obrasBenfeitorias = S(451, 'OBRAS E BENFEITORIAS', INV, '11.2', [
  A(288, 'Obras na Estrutura', INV, '11.2.1'),
]);

const tributosImobilizado = S(452, 'TRIBUTOS SOBRE IMOBILIZADO', INV, '11.3', [
  A(351, 'ICMS Ativo Imobilizado',         INV, '11.3.1'),
  A(381, 'ICMS Difal Uso e Consumo',       INV, '11.3.2'),
]);

const entradasInvestimentos = S(null, 'Entradas', INV, '', [vendaImobilizado]);
const saidasInvestimentos   = S(null, 'Saídas',   INV, '', [
  aquisicaoAtivoImob,
  obrasBenfeitorias,
  tributosImobilizado,
]);

const fluxoInvestimentos = S(null, 'Fluxo de Investimentos', INV, '', [
  entradasInvestimentos,
  saidasInvestimentos,
]);

// ─── OUTRAS MOVIMENTAÇÕES ─────────────────────────────────────────────────

const OUTRAS = 'OUTRAS';

const transacoesTemporarias = S(379, 'TRANSAÇÕES TEMPORÁRIAS', OUTRAS, '13.1', [
  A(166, 'Transferências entre Empresas do Grupo - Crédito', OUTRAS, '13.2'),
  A(165, 'Transferências entre Empresas do Grupo - Débito',  OUTRAS, '13.3'),
  A(124, 'Transferência para Aplicação Financeira',          OUTRAS, '13.4'),
  A(135, 'Transferências',                                   OUTRAS, '13.5'),
  A(132, 'Ajuste de Saldo - Entrada',                        OUTRAS, '13.6'),
  A(133, 'Ajuste de Saldo - Saída',                          OUTRAS, '13.7'),
  A(210, 'Devolução de Pagamento',                           OUTRAS, '13.8'),
]);

const movRecebíveis = S(453, 'MOVIMENTAÇÕES DE RECEBÍVEIS', OUTRAS, '14', [
  A(323, 'Recompra de Título',                   OUTRAS, '14.1'),
  A(298, 'Recompra de cheque antecipado',        OUTRAS, '14.2'),
  A(404, 'Devolução de cheque descontado',       OUTRAS, '14.3'),
  A(401, 'Recebimento de Impostos a Recolher',   OUTRAS, '14.4'),
  A(402, 'Pagmentos de Clientes a Maior',        OUTRAS, '14.5'),
]);

const outrasRecuperacoes = S(454, 'OUTRAS RECUPERAÇÕES', OUTRAS, '15', [
  A(182, 'Retenções Sobre Serviços Tomados', OUTRAS, '15.2'),
]);

const estornosDevoluções = S(455, 'ESTORNOS E DEVOLUÇÕES', OUTRAS, '16', [
  A(397, 'Estorno ou Devolução de Adiantamento de Rota',                OUTRAS, '16.1'),
  A(398, 'Estorno ou Devolução de Pagmento Indevido à Colaboradores',   OUTRAS, '16.2'),
  A(399, 'Estorno ou Devolução de Clientes',                            OUTRAS, '16.3'),
  A(400, 'Estorno ou Devolução de Fornecedores',                        OUTRAS, '16.4'),
]);

const outrasMovimentacoes = S(null, 'Outras Movimentações', OUTRAS, '', [
  transacoesTemporarias,
  movRecebíveis,
  outrasRecuperacoes,
  estornosDevoluções,
]);

// ─── ATRIBUIR pathKeys ─────────────────────────────────────────────────────

function assignPathKeys(node, base) {
  node.pathKey = base;
  node.children.forEach((ch, i) => assignPathKeys(ch, `${base}/${i}`));
}

const roots = [fluxoOperacional, fluxoFinanceiro, fluxoInvestimentos, outrasMovimentacoes];
roots.forEach((r, i) => assignPathKeys(r, `M${i}`));

// ─── ESTATÍSTICAS ──────────────────────────────────────────────────────────

let totalNos = 0, totalAnaliticos = 0;
function contar(node) {
  totalNos++;
  if (node.tipo === 'A') totalAnaliticos++;
  node.children.forEach(contar);
}
roots.forEach(contar);

console.log(`Total nós: ${totalNos}`);
console.log(`Analíticos (folhas): ${totalAnaliticos}`);
console.log(`Sintéticos (grupos): ${totalNos - totalAnaliticos}`);

// ─── SALVAR ────────────────────────────────────────────────────────────────

const output = JSON.stringify({ roots }, null, 2);
fs.writeFileSync(OUT, output);
console.log(`\nSalvo em: ${OUT}`);
