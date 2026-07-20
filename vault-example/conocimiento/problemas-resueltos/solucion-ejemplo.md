---
title: solucion-ejemplo
category: conocimiento/problemas-resueltos
tags: []
created: 2026-07-20
updated: 2026-07-20
---

# Solución de ejemplo — Error de permisos al arrancar el servidor

Plantilla de **problema resuelto**: se guarda cuando algo costó resolver, para no volver a pelearlo desde cero la próxima vez.

## El síntoma

Al arrancar el servidor, se cierra con un error de permisos sobre una carpeta.

## La causa

La carpeta de datos apuntaba a una ruta sin permisos de escritura para el usuario que corre el proceso.

## La solución

Apuntar la ruta a una carpeta con permisos correctos, o ajustar los permisos de la carpeta. Verificar con un arranque limpio.

## Por qué guardarlo

La próxima vez que aparezca el mismo error, esta nota ahorra el diagnóstico entero. Ese es el valor de `problemas-resueltos/`: convertir cada pelea ganada en un atajo permanente.

## Ver también

- [[HOME]] — dónde vive el conocimiento de oficio

#problema_resuelto
