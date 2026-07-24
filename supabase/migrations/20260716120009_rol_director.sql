-- =============================================================================
-- Capital humanIA — 0009 · Rol "director"
--
-- Agrega el segundo rol de usuario: 'director' (el perfil "Consulta y Solicitud"
-- de la propuesta de Capital Humano — agentes autorizados de cada repartición).
--
-- Va SOLO en esta migración, sin usarse todavía, a propósito: Postgres no permite
-- USAR un valor de enum en la misma transacción en la que se AGREGA. La 0010 ya lo
-- usa (handle_new_user, etc.). Por eso el orden importa:
--   1) correr esta 0009 y confirmar que terminó,
--   2) recién después correr la 0010.
--
-- No cambia nada más: los usuarios existentes siguen como estén (los admin de
-- Capital Humano siguen admin).
-- =============================================================================

alter type public.user_role add value if not exists 'director';
