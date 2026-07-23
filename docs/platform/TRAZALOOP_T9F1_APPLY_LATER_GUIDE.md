# Guía de aplicación posterior · Sprint T9F.1 — SUSTITUIDA

**Esta guía quedó obsoleta en el Sprint T9F.2 y NO debe seguirse.**

La migración `0101_t9f1_module_access_hardening.sql` fue corregida y
ACUMULADA en T9F.2 (mismo archivo, nunca aplicado hasta entonces): incluye la
vista de uso con contabilización FÍSICA deduplicada, la RPC segura ante
concurrencia, la decisión de límites en base de datos y la cola contable de
huérfanos. Aplicar la versión T9F.1 de aquel archivo dejaría el sistema en un
estado intermedio que el código de la aplicación ya no espera (fail-closed).

**Usar en su lugar:** `docs/platform/TRAZALOOP_T9F2_APPLY_LATER_GUIDE.md`
(28 pasos: verificación previa, aplicación única de 0101, despliegue del
código, suites RLS T9F.1 corregida y T9F.2 nueva, validación manual,
operación de huérfanos y rollback).
