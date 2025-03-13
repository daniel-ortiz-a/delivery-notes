import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

@Injectable()
export class SapService {
  private sessionId: string | null = null;
  private readonly host: string;
  private readonly username: string;
  private readonly password: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.host = this.configService.get<string>('SAP_HOST') ?? '';
    this.username = this.configService.get<string>('SAP_USER') ?? '';
    this.password = this.configService.get<string>('SAP_PASSWORD') ?? '';

    if (!this.host || !this.username || !this.password) {
      throw new Error('Faltan configuraciones de SAP en el .env');
    }
  }

  async login(
    companyDb: string,
  ): Promise<{ sessionId: string; version: string; sessionTimeout: number }> {
    if (this.sessionId) {
      await this.logout();
    }

    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(
      'Intentando iniciar sesión en SAP con:',
      this.host,
      this.username,
    );
    console.log('Base de datos:', companyDb);

    try {
      const response: AxiosResponse | undefined = await firstValueFrom(
        this.httpService.post(
          `${this.host}/b1s/v1/Login`,
          {
            CompanyDB: companyDb,
            UserName: this.username,
            Password: this.password,
          },
          { httpsAgent: agent },
        ),
      );

      console.log('Respuesta de SAP:', response?.data);

      if (response?.status === 200 && response.data?.SessionId) {
        this.sessionId = response.data.SessionId;
        console.log('Sesión iniciada con ID:', this.sessionId);

        return {
            sessionId: this.sessionId!, // 👈 Se fuerza a string, ya que en este punto no puede ser null
            version: response.data.Version,
            sessionTimeout: response.data.SessionTimeout,
          };
      }

      throw new InternalServerErrorException('Error al iniciar sesión en SAP');
    } catch (error) {
      console.error(
        'Error en SAP Login:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        `SAP Login failed: ${error.message}`,
      );
    }
  }

  async logout(): Promise<void> {
    if (!this.sessionId) return;

    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.host}/b1s/v1/Logout`,
          {},
          {
            httpsAgent: agent,
            headers: { Cookie: `B1SESSION=${this.sessionId}` },
          },
        ),
      );
      this.sessionId = null;
      console.log('Sesión cerrada en SAP.');
    } catch (error) {
      throw new InternalServerErrorException('Error al cerrar sesión en SAP');
    }
  }
}
