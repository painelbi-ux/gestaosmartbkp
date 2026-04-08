# Gestor de Pedidos — Previsão de Entrega (Nomus ERP)

MVP web para consultar e atualizar a previsão de entrega de pedidos, integrando ao ERP Nomus via acesso direto ao banco de dados.

## Estrutura do projeto

```
gestorpedidosSoAco/
├── backend/                 # API Node.js + Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/
│   │   ├── data/             # pedidosRepository.ts (SQL base + CTE)
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── validators/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # React + Vite + Tailwind
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── .env.example
└── README.md
```

## Pré-requisitos

- Node.js 18+
- PostgreSQL (ou SQL Server, ajustando `provider` no Prisma)
- npm ou yarn

## Configuração

### 1. Variáveis de ambiente

Copie o exemplo e ajuste:

```bash
cp .env.example backend/.env
```

Edite `backend/.env`:

- **DB_URL**: string de conexão do banco (PostgreSQL ou SQL Server).
- **APP_PORT**: porta do backend (ex.: `4000`).
- **JWT_SECRET**: chave segura para JWT (obrigatório em produção).

Exemplos de DSN:

- PostgreSQL:  
  `postgresql://USUARIO:SENHA@HOST:PORT/NOME_DB?schema=public`
- SQL Server:  
  `mssql://USUARIO:SENHA@HOST:PORT?database=NOME_DB&encrypt=true`  
  (e altere `provider` em `backend/prisma/schema.prisma` para `sqlserver`).

### 2. Onde colar o seu SQL base de pedidos

Abra **`backend/src/data/pedidosRepository.ts`** e substitua o conteúdo da constante **`SQL_BASE_PEDIDOS`** pelo seu SELECT do ERP Nomus.

O SQL base deve retornar pelo menos:

- `id_pedido`
- `cliente`
- `produto`
- `qtd`
- `previsao_entrega` (data)

O repositório já envolve esse SQL em uma CTE e adiciona a coluna **`previsao_entrega_atualizada`** (último ajuste da tabela `pedido_previsao_ajuste` ou a previsão original).

## Execução

**Portas:** **5180** = acesso interno (rede local), **5173** = acesso externo (internet/outra rede). A **4000** é a API (backend).

### Opção A — Um comando só (recomendado)

Na **pasta raiz** do projeto (`gestorpedidosSoAco`):

```bash
npm install
npm run dev
```

Isso sobe o backend (4000) e **dois** frontends: **5180** (interno) e **5173** (externo).

- **Interno (rede local):** http://localhost:5180 ou http://SEU_IP:5180  
- **Externo:** http://170.84.146.147:5173 (liberar/encaminhar porta 5173 no roteador se for internet)

#### Firewall (acesso por IP)

No PC onde o app roda, abra PowerShell **como Administrador**:

```powershell
cd C:\caminho\para\gestorpedidosSoAco
.\scripts\liberar-porta-externo.ps1
```

Isso libera as portas **5180** e **5173** no Firewall do Windows. Para acesso pela internet, encaminhe a **5173** no roteador (ex.: MikroTik) para o IP do PC.

#### Externo ainda não abre pelo link?

1. **Firewall Windows:** execute `scripts\liberar-porta-externo.ps1` como Administrador (libera 5180 e 5173).
2. **Teste na rede local:** de outro PC na mesma rede, abra `http://IP_DO_PC:5180` (interno). Se abrir, o servidor está OK na LAN.
3. **Acesso pela internet:** no roteador (ex. MikroTik), encaminhe a porta **5173** para o IP do PC onde o app roda:
   - **MikroTik:** IP → Firewall → NAT → Add → Chain=dstnat, Dst. Port=5173, Action=dst-nat, To Addresses=IP_DO_PC, To Ports=5173. Depois em Firewall → Filter Rules permitir tráfego na porta 5173.
   - Use o **IP público** do link (ex. 170.84.146.147) para acessar de fora.

### Opção B — Dois terminais (só interno)

**Terminal 1 — backend (porta 4000):**

```bash
cd backend
npm install
npx prisma generate
npm run migrate
npm run seed           # opcional: admin / admin123
npm run dev
```

**Terminal 2 — frontend interno (porta 5180):**

```bash
cd frontend
npm install
npm run dev -- --port 5180
```

Para ter também o externo (5173), em um terceiro terminal: `npm run dev -- --port 5173` (na pasta frontend).

#### URL amigável (opcional)

Para acessar com um endereço mais amigável em desenvolvimento (ex.: **http://gestaosmart.local:5180/entrar**):

1. **Windows**: Edite como administrador o arquivo `C:\Windows\System32\drivers\etc\hosts` e adicione uma linha:
   ```
   127.0.0.1   gestaosmart.local
   ```
2. Salve o arquivo e abra no navegador: **http://gestaosmart.local:5180/entrar**

A rota de login é **/entrar** (em vez de /login). Use **http://localhost:5180/entrar** (interno) ou **http://IP:5173/entrar** (externo).

### Build para produção

```bash
# Backend
cd backend && npm run build && npm run migrate && npm start

# Frontend
cd frontend && npm run build
# Servir a pasta frontend/dist com nginx ou similar; API em backend.
```

## Scripts npm (backend)

| Script         | Descrição                          |
|----------------|------------------------------------|
| `npm run dev`  | Desenvolvimento (tsx watch)        |
| `npm run build`| Compila TypeScript                 |
| `npm start`    | Roda `dist/server.js`              |
| `npm run migrate` | Aplica migrations no banco     |
| `npm run migrate:dev` | Cria nova migration (dev)     |
| `npm run generate` | Gera Prisma Client              |
| `npm run seed` | Popula usuário de exemplo          |
| `npm run test` | Testes (rota + repositório)        |

## Funcionalidades

- **Login/Logout**: sessão com JWT em cookie httpOnly e token CSRF.
- **Dashboard (/)**:
  - Cards: total de pedidos, entrega hoje, atrasados, lead time médio (dias).
  - Tabela: id_pedido, cliente, produto, qtd, previsão original, previsão atualizada, status atraso, botão “Ajustar previsão”.
- **Filtros**: cliente, data início/fim, somente atrasados.
- **Ajuste de previsão**: modal com nova data e motivo; grava em `pedido_previsao_ajuste` (histórico) e reflete no SELECT.

## Quando o SQL do Nomus é executado?

**Sim: toda vez que o sistema precisa da lista de pedidos ou dos totais, a consulta SQL ao banco Nomus (MySQL) é executada de novo.** Não há cache em memória.

Isso acontece nos seguintes momentos:

- **Ao abrir o Dashboard** — as chamadas a `GET /api/pedidos/resumo` e `GET /api/pedidos/observacoes-resumo` disparam o SQL (via `listarPedidos` no backend).
- **Ao abrir a página Pedidos** — `GET /api/pedidos` com paginação executa o SQL.
- **Ao aplicar filtros ou trocar de página** — cada nova requisição a `GET /api/pedidos` executa o SQL de novo.
- **Ao exportar XLSX** — `GET /api/pedidos/export` executa o SQL (retorna todos os pedidos conforme os filtros, sem paginação).

Ou seja: **cada vez que uma dessas APIs é chamada, o backend roda a query do arquivo `sqlBasePedidosNomus.sql` no MySQL do Nomus** e, em seguida, aplica os ajustes gravados no SQLite local. Os dados exibidos são sempre os mais recentes disponíveis no Nomus no instante da requisição.

Se quiser reduzir a carga no Nomus, dá para implementar cache (por exemplo, guardar o resultado por 1–5 minutos) no backend antes de chamar `listarPedidos`.

## API (resumo)

- `POST /auth/login` — login (retorna cookie + csrf_token).
- `POST /auth/logout` — logout.
- `GET /auth/csrf` — retorna token CSRF.
- `GET /api/pedidos` — lista pedidos (query: cliente, data_ini, data_fim, atrasados, observacoes, pd, grupo_produto, municipio_entrega, page, limit).
- `GET /api/pedidos/export` — lista todos os pedidos (sem paginação) para exportação XLSX.
- `GET /api/pedidos/resumo` — totais para os cards.
- `GET /api/pedidos/observacoes-resumo` — totais por observação (gráfico).
- `GET /api/pedidos/:id/historico` — histórico de ajustes do pedido.
- `POST /api/pedidos/:id/ajustar-previsao` — body: `{ previsao_nova, motivo }` (requer CSRF e auth).

## Testes

```bash
cd backend
npm run test
```

- **health.test.ts**: GET /health retorna 200 e `{ ok: true }`.
- **pedidosRepository.test.ts**: `listarPedidos` retorna array; `obterResumoDashboard` retorna objeto com total, entregaHoje, atrasados, leadTimeMedioDias (requer DB configurado ou pode falhar por conexão).

## Segurança e boas práticas

- Consultas parametrizadas no repositório.
- Transação ao gravar ajuste.
- Auditoria: `usuario` e `data_ajuste` em `pedido_previsao_ajuste`.
- Rate limit em `POST /api/pedidos/:id/ajustar-previsao`.
- Validação com Zod no backend; frontend também usa Zod onde aplicável.
- JWT em cookie httpOnly; CSRF para requisições de escrita.

## Solução de problemas

### "Servidor offline" / ECONNREFUSED / 500 no login ou no ping

**Causa:** O backend precisa escutar na **porta 4000**. O proxy do Vite e o `wait-on` só usam `http://localhost:4000`. Se o backend subir em outra porta (ex.: 3000 por causa do `backend/.env`), o frontend não consegue falar com a API.

**O que foi feito no projeto:**

1. **`backend/src/load-dotenv.ts`** usa `override: false` ao carregar o `.env`. Assim, quando você roda **`npm run dev` na raiz**, o `run-backend-loop` já define `APP_PORT=4000` e o `.env` **não** sobrescreve essa porta.
2. **Sempre subir pela raiz:** na pasta raiz execute `npm run dev`. Não rode só `npm run dev` dentro de `backend/` se no `.env` tiver `APP_PORT` diferente de 4000 — ou alinhe com `APP_PORT=4000` (o script da raiz força 4000 ao subir pela raiz).
3. Se o backend estiver em outra porta, no log aparecerá:  
   `[startup] Backend na porta X. Proxy e wait-on esperam 4000 — use APP_PORT=4000 ou rode "npm run dev" na raiz.`

**Resumo:** Para desenvolvimento local com os dois frontends (5180 e 5173), use **sempre** `npm run dev` na **pasta raiz**. O backend sobe na 4000, o wait-on espera o `/health` na 4000 e só então sobem os frontends; o watchdog testa ping/login e reinicia o backend se falhar.

### Erro 500 vira 503 no navegador

O backend e o proxy do Vite foram configurados para **nunca** devolver 500 ao cliente: qualquer 500 é convertido em 503 (Serviço indisponível), para evitar a mensagem genérica "Internal Server Error". Se aparecer 503, verifique os logs do backend e do banco (conexão, migrations, seed).

---

## Próximos passos

1. **Colar seu SQL base**: em `backend/src/data/pedidosRepository.ts`, substitua o conteúdo de `SQL_BASE_PEDIDOS` pelo seu SELECT do Nomus (mantendo o marcador `/* SQL_BASE_PEDIDOS */` se quiser, ou removendo).
2. **Trocar DSN**: configure `DB_URL` no `backend/.env` com usuário, senha, host, porta e nome do banco do seu ambiente.
3. **Rodar local**:  
   - `cd backend && npm install && npx prisma generate && npm run migrate && npm run dev`  
   - `cd frontend && npm install && npm run dev`  
   - Acesse http://localhost:5180 (interno) ou http://IP:5173 (externo), faça login (ex.: admin / admin123 após `npm run seed`) e use o dashboard e o ajuste de previsão.
