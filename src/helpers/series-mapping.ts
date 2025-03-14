export const getInvoiceSeries = (
  company: string,
  deliverySeries: number,
): number | null => {
  const seriesMapping: Record<string, Record<number, number>> = {
    SBO_Alianza: {
      105: 224,
      180: 250,
      53: 215,
      54: 217,
      55: 206,
      75: 222,
      74: 219,
    },
    SBO_Pruebas: {
      105: 224,
      180: 250,
      53: 215,
      54: 217,
      55: 206,
      75: 222,
      74: 219,
    },
    SBO_FGE: {
      112: 146,
    },
    SBO_MANUFACTURING: {
      7: 89,
      64: 89,
    },
  };

  return seriesMapping[company]?.[deliverySeries] ?? null;
};
