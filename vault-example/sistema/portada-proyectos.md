---
title: portada-proyectos
category: sistema
tags: []
created: 2026-07-20
updated: 2026-07-20
---

# Portada — Proyectos

> Nivel 2 de [[la-piramide]]. El router [[Inicio]] carga esta portada cuando el tema entra por "proyecto". No es el trabajo: es el índice y las reglas de esta rama.

## Qué carga esta rama

- **Automático:** nada pesado de entrada. Primero se sitúa de qué proyecto se habla.
- **A demanda:** la nota del proyecto concreto (ej. [[proyecto-ejemplo]]).

## Reglas de la rama

- Un proyecto por sesión. Si hay que saltar a otro, se avisa antes de cargar.
- Antes de crear una nota nueva de proyecto, buscar si ya existe (`search_notes`).
- Cada proyecto vivo tiene su nota; al cerrarse, se archiva y se limpia.

## Proyectos

- [[proyecto-ejemplo]] — ejemplo de nota de proyecto propio

## Ver también

- [[Inicio]] — el router que lleva hasta aquí
- [[la-piramide]] — el sistema de niveles

#sistema #portada #proyectos
