# Imagen para BovedIA (servidor MCP). Sirve para los checks de Glama
# y para correr el servidor en un contenedor.
FROM node:20-alpine

WORKDIR /app

# Dependencias (solo producción)
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# El motor
COPY server/index.js ./

# Carpeta de la bóveda por defecto dentro del contenedor.
# Móntala como volumen para persistir: -v /ruta/local:/data
RUN mkdir -p /data
ENV KB_MEMORY_ROOT=/data

# El servidor habla por stdio (protocolo MCP)
ENTRYPOINT ["node", "index.js"]
