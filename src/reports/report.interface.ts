export interface SapError {
  timestamp: Date;
  company: string;
  docEntry?: number;
  errorCode: number;
  errorMessage: string;
  sapErrorMessage?: string;
  details?: string;
}

export interface ReportData {
  startTime: Date;
  endTime: Date;
  totalProcessed: number;
  totalErrors: number;
  errors: SapError[];
  companyStats: {
    [key: string]: {
      totalProcessed: number;
      totalErrors: number;
      errors: SapError[];
    };
  };
}
