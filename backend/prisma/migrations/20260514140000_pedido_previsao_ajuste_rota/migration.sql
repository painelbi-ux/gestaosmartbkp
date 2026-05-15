-- Adiciona coluna `rota` em pedido_previsao_ajuste para suportar override por rota
-- (quando o mesmo (PD, item) está vinculado a 2+ romaneios com observações diferentes).
--   rota = NULL  => ajuste base (vale em todas as rotas do PD/item).
--   rota != NULL => override por rota (nome da observação do romaneio, já normalizado).
ALTER TABLE "pedido_previsao_ajuste" ADD COLUMN "rota" TEXT;

CREATE INDEX "pedido_previsao_ajuste_id_pedido_rota_idx" ON "pedido_previsao_ajuste"("id_pedido", "rota");
