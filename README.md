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

**Portas:** **5180** = interno (LAN). **5173**, **5174** e **5051** = três Vite externos (qualquer uma serve; use a que o MikroTik encaminhar). **4000** = API (backend).

### Opção A — Um comando só (recomendado)

Na **pasta raiz** do projeto (`gestorpedidosSoAco`):

```bash
npm install
npm run dev
```

Isso sobe o backend (4000), o Vite **5180** (interno) e **três** Vites externos nas portas **5173**, **5174** e **5051**.

- **Interno (rede local):** http://localhost:5180 ou http://SEU_IP:5180  
- **Externo (escolha a porta aberta no MikroTik):** por exemplo `http://170.84.146.147:5173` ou `:5174` ou `:5051` (login na raiz `/`)

#### Domínio `gsmartsoaco.com.br` (só nome, sem `:5173`)

**DNS:** registro **A** `@` e **A** (ou **CNAME**) `www` → `170.84.146.147`. Nameservers normais da Hostinger.

**Porta 80 (HTTP “normal”):** o Vite continua na **5173** no PC; não é preciso instalar nada na porta 80 no Windows. No **MikroTik**, adicione **dst-nat**: tráfego **WAN tcp/80** → **IP do PC tcp/5173** (primeira regra em `deploy/mikrotik-nat-externos.rsc`). Ative **hairpin-nat** na mesma regra. A partir daí:

- **http://gsmartsoaco.com.br** e **http://www.gsmartsoaco.com.br** abrem o login na raiz `/` (a rota antiga `/entrar` redireciona para `/`).

**Manter também a 5173:** se quiser continuar a testar por `http://IP:5173`, mantenha a regra NAT da porta **5173** (já existente). A **API** segue pela mesma origem (proxy do Vite); **não defina `VITE_API_URL`**.

**Conflito:** se no futuro a porta **80** da internet tiver de servir **só** o Let's Encrypt para outro destino, use DNS-01 para o certificado ou ajuste as regras NAT — não duplique 80 para dois serviços sem critério.

**Página em branco em `http://gsmartsoaco.com.br/` (sem `:5173`):** em modo dev o Vite usa WebSocket (HMR) na mesma porta do servidor; com NAT **80→5173** o browser pensa que está na **80**, mas o cliente tentava ligar o WS à **5173** (muitas vezes fechada no MikroTik). Crie `frontend/.env.development.local` com `VITE_DISABLE_HMR=true` (há exemplo em `frontend/.env.example`) e **reinicie** `npm run dev`. Use **`http://`** (não `https://`) enquanto não houver TLS no Vite.

#### Firewall (acesso por IP)

No PC onde o app roda, abra PowerShell **como Administrador**:

```powershell
cd C:\caminho\para\gestorpedidosSoAco
.\scripts\liberar-porta-externo.ps1
```

Isso libera **5180**, **5173**, **5174**, **5051** e **4000** no Firewall. No MikroTik, encaminhe para o IP do PC as portas que for usar (5173, 5174 e/ou 5051).

#### Externo ainda não abre pelo link?

1. **Firewall Windows:** execute `scripts\liberar-porta-externo.ps1` como Administrador.
2. **Teste na rede local:** de outro PC na mesma rede, abra `http://IP_DO_PC:5180` (interno). Se abrir, o servidor está OK na LAN.
3. **Acesso pela internet:** no MikroTik, **dst-nat** da(s) porta(s) que usar (**5173**, **5174**, **5051**) para o IP do PC — ver `deploy/mikrotik-nat-externos.rsc`.
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

Com `npm run dev` na raiz já sobem os três externos; não precisa de terminais extra.

#### URL amigável (opcional)

Para acessar com um endereço mais amigável em desenvolvimento (ex.: **http://gestaosmart.local:5180/**):

1. **Windows**: Edite como administrador o arquivo `C:\Windows\System32\drivers\etc\hosts` e adicione uma linha:
   ```
   127.0.0.1   gestaosmart.local
   ```
2. Salve o arquivo e abra no navegador: **http://gestaosmart.local:5180/**

O login fica na **raiz** `/` (links antigos para `/entrar` redirecionam). Use **http://localhost:5180/** (interno) ou **http://IP:5173** (ou :5174 / :5051 conforme o NAT).

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

**Resumo:** Para desenvolvimento com interno + três externos (5180 + 5173+5174+5051), use **sempre** `npm run dev` na **pasta raiz**. O backend sobe na 4000 e os frontends sobem **em paralelo** (a página abre logo; se a API ainda não estiver pronta, aparece “servidor offline” até o `/health` responder). O watchdog testa ping/login e reinicia o backend se falhar. (Script opcional: `npm run dev:wait-fe` só sobe o Vite depois do `/health`.)

### Erro 500 vira 503 no navegador

O backend e o proxy do Vite foram configurados para **nunca** devolver 500 ao cliente: qualquer 500 é convertido em 503 (Serviço indisponível), para evitar a mensagem genérica "Internal Server Error". Se aparecer 503, verifique os logs do backend e do banco (conexão, migrations, seed).

---

## Próximos passos

1. **Colar seu SQL base**: em `backend/src/data/pedidosRepository.ts`, substitua o conteúdo de `SQL_BASE_PEDIDOS` pelo seu SELECT do Nomus (mantendo o marcador `/* SQL_BASE_PEDIDOS */` se quiser, ou removendo).
2. **Trocar DSN**: configure `DB_URL` no `backend/.env` com usuário, senha, host, porta e nome do banco do seu ambiente.
3. **Rodar local**:  
   - `cd backend && npm install && npx prisma generate && npm run migrate && npm run dev`  
   - `cd frontend && npm install && npm run dev`  
   - Acesse http://localhost:5180 (interno) ou http://IP:5173 (ou :5174 / :5051) (externo), faça login (ex.: admin / admin123 após `npm run seed`) e use o dashboard e o ajuste de previsão.
