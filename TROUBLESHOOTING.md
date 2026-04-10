# Solução de problemas

## Erros 503 no console (api/me, auth/ping, auth/login, etc.)

**Causa:** O backend (API) não está rodando ou não está acessível na porta **4000**. O proxy do frontend (Vite) retorna 503 quando não consegue conectar ao backend.

**O que fazer:**

1. **Subir o projeto completo (recomendado)**  
   Na **pasta raiz** do projeto (onde está o `package.json`), execute:
   ```bash
   npm run dev
   ```
   Isso inicia o backend (porta 4000) e, depois do `/health`, inicia o Vite interno (5180) e os três externos (5173, 5174, 5051). Não feche o terminal.

2. **Se estiver só no frontend**  
   Se você rodou apenas `npm run dev` dentro de `frontend/`, o backend não sobe. Use `npm run dev` na **raiz** para ter backend + frontend.

3. **Backend já rodando em outro terminal**  
   Se o backend for iniciado à parte (por exemplo `npm run dev` em `backend/`), confira:
   - A aplicação está escutando na porta **4000**.
   - No terminal do backend não há mensagem de erro (ex.: falha no Prisma, falta de `.env`).

4. **Banco de dados (SQLite)**  
   O backend usa SQLite (configurado em `backend/.env` com `DB_URL`). Se for a primeira vez ou após um clone:
   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate deploy
   ```

5. **Acesso por outra máquina (IP)**  
   Se você acessa o frontend por IP (ex.: `http://192.168.x.x:5180`) e o backend está em outra máquina, defina no frontend o `.env` (ou `.env.local`) com a URL do backend:
   ```
   VITE_API_URL=http://IP-DO-BACKEND:4000
   ```
   E reinicie o frontend.

---

**Resumo:** Os 503 costumam ser resolvidos subindo o backend. Na raiz do projeto, use `npm run dev` e aguarde o backend ficar online antes de usar o sistema.
