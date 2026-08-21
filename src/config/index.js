const config = {
  // Node environment
  nodeEnv: process.env.NODE_ENV || "development",
  
  // Telegram bot token
  botToken: process.env.BOT_TOKEN,
  
  // PostgreSQL (Prisma) — server bilan bir xil baza.
  // Filial `?schema=` bilan tanlanadi (config/branch.js).
  databaseUrl: process.env.DATABASE_URL,

  // Platforma schema'si — filiallar reyestri va yo'naltirgichlar
  // (username → filial, telegramId → filial). Kiritilmasa DATABASE_URL dan
  // hosil qilinadi (`validateConfig`).
  platformDatabaseUrl: process.env.PLATFORM_DATABASE_URL || null,
  platformSchema: process.env.PLATFORM_SCHEMA || "platform",
  
  // Daily report sending time (HH:MM format)
  dailyReportTime: process.env.DAILY_REPORT_TIME || "18:00",
  
  // Rate limit settings
  messageDelayMs: parseInt(process.env.MESSAGE_DELAY_MS, 10) || 50,
  batchSize: parseInt(process.env.BATCH_SIZE, 10) || 25,
  batchDelayMs: parseInt(process.env.BATCH_DELAY_MS, 10) || 1000,
  
  // Timezone
  timezone: process.env.TIMEZONE || "Asia/Tashkent",
};

// Validate required configurations
const validateConfig = () => {
  if (!config.botToken) {
    throw new Error("BOT_TOKEN environment variable is required");
  }
  
  // Check time format (HH:MM)
  const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(config.dailyReportTime)) {
    throw new Error("DAILY_REPORT_TIME must be in HH:MM format (e.g., 18:00)");
  }

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // Platforma ulanish satri — DATABASE_URL dan hosila. `process.env` ga ham
  // yoziladi, chunki `prisma generate` uni datasource'dan o'qiydi.
  if (!config.platformDatabaseUrl) {
    const url = new URL(config.databaseUrl);
    url.searchParams.set("schema", config.platformSchema);
    config.platformDatabaseUrl = url.toString();
    process.env.PLATFORM_DATABASE_URL = config.platformDatabaseUrl;
  }

  return true;
};

module.exports = { config, validateConfig };
