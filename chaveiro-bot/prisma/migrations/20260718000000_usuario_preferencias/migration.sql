-- F9/M5: preferências de UI por usuário (cross-device), ex. ordem/visibilidade dos
-- widgets do dashboard. Coluna JSONB nula e aditiva; nenhum registro existente muda.

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "preferencias" JSONB;
