export default () => ({
    sap: {
      host: process.env.SAP_HOST,
      username: process.env.SAP_USER,
      password: process.env.SAP_PASSWORD,
      staticCompanies: process.env.SAP_STATIC_COMPANIES?.split(',') || [],
      dynamicCompanies: process.env.SAP_DYNAMIC_COMPANIES?.split(',').map(c => `SBO_${c.toUpperCase()}`) || [],
    },
  });