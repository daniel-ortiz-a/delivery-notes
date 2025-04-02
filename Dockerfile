FROM node:22.14-alpine

# Configurar zona horaria para Ciudad de México
RUN apk add --no-cache tzdata
ENV TZ=America/Mexico_City

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]

