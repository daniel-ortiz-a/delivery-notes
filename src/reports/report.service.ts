import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ErrorReport {
  timestamp: Date;
  company: string;
  docEntry?: number;
  errorCode: number;
  errorMessage: string;
  sapErrorMessage?: string;
  details?: string;
}

interface SuccessReport {
  timestamp: Date;
  company: string;
  docEntry: number;
  docDate: string;
  cardCode: string;
  totalLines: number;
}

interface ReportData {
  startTime: Date;
  errors: ErrorReport[];
  successes: SuccessReport[];
  processedCounts: Record<string, number>;
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private readonly reportsDir: string;
  private currentReport: ReportData;
  private readonly generateReports: boolean;

  constructor() {
    this.reportsDir = path.join(process.cwd(), 'src', 'reports', 'generated');
    this.ensureDirectoryExists();
    this.currentReport = this.initializeReport();
    this.generateReports = process.env.GENERATE_REPORTS === 'true';
  }

  private initializeReport(): ReportData {
    return {
      startTime: new Date(),
      errors: [],
      successes: [],
      processedCounts: {},
    };
  }

  startNewReport(): void {
    this.currentReport = this.initializeReport();
  }

  incrementProcessed(company: string): void {
    this.currentReport.processedCounts[company] =
      (this.currentReport.processedCounts[company] || 0) + 1;
  }

  addError(error: ErrorReport): void {
    this.currentReport.errors.push(error);
  }

  addSuccess(success: SuccessReport): void {
    this.currentReport.successes.push(success);
  }

  async generateReport(): Promise<string> {
    if (!this.generateReports) {
      this.logger.log('Generación de reportes desactivada en producción');
      return 'Generación de reportes desactivada en producción';
    }

    const endTime = new Date();
    const duration = endTime.getTime() - this.currentReport.startTime.getTime();
    const durationMinutes = Math.floor(duration / (1000 * 60));

    // Generar reporte de errores
    const errorReportContent = this.generateErrorReport(
      endTime,
      durationMinutes,
    );
    const errorReportPath = await this.saveReport(errorReportContent, 'error');

    // Generar reporte de éxitos
    const successReportContent = this.generateSuccessReport(
      endTime,
      durationMinutes,
    );
    const successReportPath = await this.saveReport(
      successReportContent,
      'success',
    );

    return `Reportes generados:\n- Errores: ${errorReportPath}\n- Éxitos: ${successReportPath}`;
  }

  private formatDate(date: Date): string {
    return format(date, 'dd/MM/yyyy, h:mm:ss a', { locale: es });
  }

  private generateErrorReport(endTime: Date, durationMinutes: number): string {
    const companies = [
      ...new Set(this.currentReport.errors.map((e) => e.company)),
    ];
    const totalErrors = this.currentReport.errors.length;

    let report = 'REPORTE DE ERRORES SAP\n';
    report += '=====================\n\n';

    report += `Fecha de inicio: ${this.formatDate(this.currentReport.startTime)}\n`;
    report += `Fecha de fin: ${this.formatDate(endTime)}\n`;
    report += `Duración: ${durationMinutes} minutos\n\n`;

    report += `Total de documentos procesados: ${Object.values(this.currentReport.processedCounts).reduce((a, b) => a + b, 0)}\n`;
    report += `Total de errores encontrados: ${totalErrors}\n\n`;

    report += 'ESTADÍSTICAS POR EMPRESA\n';
    report += '=======================\n\n';

    for (const company of companies) {
      const companyErrors = this.currentReport.errors.filter(
        (e) => e.company === company,
      );
      const processedCount = this.currentReport.processedCounts[company] || 0;
      report += `${company}:\n`;
      report += `  - Documentos procesados: ${processedCount}\n`;
      report += `  - Errores encontrados: ${companyErrors.length}\n\n`;
    }

    report += 'DETALLE DE ERRORES\n';
    report += '=================\n\n';

    // Agrupar errores por tipo
    const errorTypes = {
      '-5000': 'Error al crear la factura',
      '-5001': 'Nota no cumple con el criterio de 72 horas',
      '-5002': 'Nota ya facturada anteriormente',
      '-5003': 'Error de validación en los datos de la factura',
      '-5004': 'Error en el formato de los datos enviados',
      '-5005': 'Error de permisos o autorización en SAP',
      '-5006': 'Error de conexión con la base de datos SAP',
      '-5007': 'Error en la validación de la serie de facturación',
      '-5008': 'Error en la validación del cliente (CardCode)',
      '-5009': 'Error en la validación de los artículos',
      '-5010': 'Error en la validación de cantidades o precios',
      '-5011': 'Nota con múltiples tipos de cambio',
    };

    for (const [errorCode, errorDescription] of Object.entries(errorTypes)) {
      const errorsOfType = this.currentReport.errors.filter(
        (e) => e.errorCode === parseInt(errorCode),
      );

      if (errorsOfType.length > 0) {
        report += `${errorDescription} (Código ${errorCode})\n`;
        report += '----------------------------------------\n\n';

        for (const error of errorsOfType) {
          report += `Empresa: ${error.company}\n`;
          report += `DocEntry: ${error.docEntry}\n`;
          report += `CardCode: ${error.details?.match(/CardCode: ([^,]+)/)?.[1] || 'N/A'}\n`;
          report += `Fecha: ${this.formatDate(error.timestamp)}\n`;
          if (error.sapErrorMessage) {
            report += `Error SAP: ${error.sapErrorMessage}\n`;
          }
          if (error.details) {
            report += `Detalles: ${error.details}\n`;
          }
          report += '-------------------\n\n';
        }
      }
    }

    return report;
  }

  private generateSuccessReport(
    endTime: Date,
    durationMinutes: number,
  ): string {
    const companies = [
      ...new Set(this.currentReport.successes.map((s) => s.company)),
    ];
    const totalSuccesses = this.currentReport.successes.length;

    let report = 'REPORTE DE FACTURAS CREADAS\n';
    report += '=========================\n\n';

    report += `Fecha de inicio: ${this.formatDate(this.currentReport.startTime)}\n`;
    report += `Fecha de fin: ${this.formatDate(endTime)}\n`;
    report += `Duración: ${durationMinutes} minutos\n\n`;

    report += `Total de documentos procesados: ${Object.values(this.currentReport.processedCounts).reduce((a, b) => a + b, 0)}\n`;
    report += `Total de facturas creadas exitosamente: ${totalSuccesses}\n\n`;

    report += 'ESTADÍSTICAS POR EMPRESA\n';
    report += '=======================\n\n';

    for (const company of companies) {
      const companySuccesses = this.currentReport.successes.filter(
        (s) => s.company === company,
      );
      const processedCount = this.currentReport.processedCounts[company] || 0;
      report += `${company}:\n`;
      report += `  - Documentos procesados: ${processedCount}\n`;
      report += `  - Facturas creadas: ${companySuccesses.length}\n\n`;
    }

    report += 'DETALLE DE FACTURAS CREADAS\n';
    report += '=========================\n\n';

    for (const success of this.currentReport.successes) {
      report += `Fecha: ${this.formatDate(success.timestamp)}\n`;
      report += `Empresa: ${success.company}\n`;
      report += `DocEntry: ${success.docEntry}\n`;
      report += `Fecha Documento: ${success.docDate}\n`;
      report += `Código Cliente: ${success.cardCode}\n`;
      report += `Total Líneas: ${success.totalLines}\n`;
      report += '-------------------\n\n';
    }

    return report;
  }

  private async saveReport(
    content: string,
    type: 'error' | 'success',
  ): Promise<string> {
    const timestamp = format(new Date(), "yyyy-MM-dd'T'HH-mm-ss-SSS'Z'");
    const fileName = `sap-${type}-report-${timestamp}.txt`;
    const filePath = path.join(this.reportsDir, fileName);

    try {
      await fs.promises.writeFile(filePath, content, 'utf8');
      return filePath;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al guardar el reporte: ${errorMessage}`);
      throw error;
    }
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }
}
