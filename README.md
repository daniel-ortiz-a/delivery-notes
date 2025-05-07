<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

# Delivery Notes - Facturación Automática SAP

## Descripción

Sistema de facturación automática que integra notas de entrega con SAP B1, desarrollado con NestJS. Este sistema automatiza el proceso de facturación de notas de entrega, reduciendo errores manuales y mejorando la eficiencia del proceso.

## Características Principales

### Facturación Automática

- **Procesamiento de Notas**: Convierte automáticamente notas de entrega en facturas en SAP B1
- **Múltiples Empresas**: Soporta tres bases de datos SAP diferentes:
  - SBO_Alianza: Base de datos principal
  - SBO_FGE: Base de datos para FGE
  - SBO_MANUFACTURING: Base de datos para manufactura
- **Sistema de Paginación**: Procesa las notas en lotes de 10 para evitar sobrecarga
- **Validación de Duplicados**: Evita la facturación duplicada de notas
- **Manejo de Errores**: Sistema detallado de captura y registro de errores SAP

### Filtros de Facturación

1. **Público General**

   - Sistema de filtrado por códigos de cliente específicos:
     - SBO_Alianza: Clientes de alianza (7 códigos específicos)
     - SBO_FGE: Cliente MOSTR2
     - SBO_MANUFACTURING: Cliente C-0182
   - Para clientes de público general, se aplica la regla de 72 horas:
     - Las notas se facturan después de 72 horas desde su fecha de creación
     - Ejemplo: Una nota del 20 de marzo se facturará el 23 de marzo
   - Para otros clientes, no se aplica la regla de 72 horas

2. **Criterios de Filtrado**
   - **Estado de Nota**: Solo procesa notas con estado 'bost_Open' (abiertas)
   - **Auditoría**: Excluye notas marcadas para auditoría (U_Auto_Auditoria = 'N')
   - **Fecha**: Procesa notas con fecha anterior a la actual para evitar facturas futuras
   - **Tipo de Cambio**: Filtra las Notas de Entrega que tengan dos tipos de cambio diferentes

### Programación

- **Ejecución Automática**:
  - Lunes a Viernes: Cada 10 minutos de 18:40 a 23:30
  - Sábados: Cada 10 minutos de 12:00 a 13:00
  - No se ejecuta en domingos
- **Configuración Cron**:
  - Monitoreo de ejecuciones previas
  - Prevención de ejecuciones simultáneas
- **Monitoreo**: Sistema de logs detallado de cada ejecución

### Reportes

- **Facturas Exitosas**: Registro detallado de cada factura creada
- **Errores**:
  - Códigos de error SAP específicos
  - Mensajes descriptivos del error
  - Detalles técnicos para diagnóstico
- **Estadísticas**:
  - Total de notas procesadas
  - Notas ya facturadas
  - Notas que no cumplen criterios
  - Errores por tipo
  - Facturas exitosas por empresa
- **Generación**: Reportes automáticos al finalizar cada ejecución

## Configuración

### Variables de Entorno

```env
# URL del servicio SAP B1
SAP_SL_URL=

# Credenciales de acceso a SAP
SAP_USERNAME=
SAP_PASSWORD=

# Bases de datos SAP por empresa
SAP_DB_AE=    # Base de datos Alianza
SAP_DB_FG=    # Base de datos FGE
SAP_DB_FGM=   # Base de datos Manufacturing
```

### Instalación

```bash
# Instalar dependencias
$ npm install

# Configurar variables de entorno
$ cp .env.example .env
```

### Ejecución

```bash
# Modo desarrollo (con hot-reload)
$ npm run start:dev

# Modo producción
$ npm run start:prod
```

## Estructura del Proyecto

```
src/
├── config/           # Configuraciones y cron jobs
│   ├── invoice-cron.module.ts    # Módulo de programación
│   └── invoice-cron.service.ts   # Servicio de cron
├── helpers/          # Utilidades y mapeos
│   └── series-mapping.ts         # Mapeo de series de facturación
├── reports/          # Sistema de reportes
│   ├── report.service.ts         # Servicio de reportes
│   └── report.module.ts          # Módulo de reportes
├── sap-invoice/      # Módulo principal de facturación
│   ├── sap-invoice.service.ts    # Lógica principal
│   ├── sap-invoice.controller.ts # Endpoints API
│   └── dto/                      # Objetos de transferencia de datos
└── app.module.ts     # Módulo principal
```

## Códigos de Error SAP

Sistema de manejo de errores específicos de SAP:

- **-5002**:
  - Nota ya facturada anteriormente
  - Cantidad de factura excede la disponible en la nota
- **-5003**: Error en la validación de datos de la factura
- **-5004**: Error en el formato de los datos enviados a SAP
- **-5005**: Error de permisos o autorización en SAP
- **-5006**: Error de conexión con la base de datos SAP
- **-5007**: Error en la validación de la serie de facturación
- **-5008**: Error en la validación del cliente (CardCode)
- **-5009**: Error en la validación de los artículos
- **-5010**: Error en la validación de cantidades o precios
- **-5011**: Nota con múltiples tipos de cambio

Cada error incluye un mensaje descriptivo y detalles técnicos para facilitar el diagnóstico y solución.
