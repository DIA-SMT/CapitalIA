-- =============================================================================
-- Capital humanIA — 0014 · Rol "secretario"
--
-- Tercer rol: mismos permisos que 'director', pero con alcance a TODA su
-- secretaría (su repartición más las que dependen de ella en el organigrama).
-- "La misma llegada, un escalón más arriba".
--
-- Va SOLO en esta migración, igual que la 0009: Postgres no permite USAR un valor
-- de enum en la misma transacción en la que se AGREGA. La 0015 ya lo usa.
-- Correr esta primero y confirmar que terminó antes de seguir.
-- =============================================================================

alter type public.user_role add value if not exists 'secretario';
