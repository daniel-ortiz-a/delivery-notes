FROM node:22.14-alpine

# Configurar zona horaria para Ciudad de México
RUN apk add --no-cache tzdata
ENV TZ=America/Mexico_City

# Configurar variable de entorno para controlar reportes en producción
ENV GENERATE_REPORTS=false

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

# Usar el comando de producción y agregar manejo de señales
CMD ["npm", "run", "start:prod"]

