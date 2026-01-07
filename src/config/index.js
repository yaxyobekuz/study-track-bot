const config = {
  // Node environment
  nodeEnv: process.env.NODE_ENV || "development",
  
  // Telegram bot token
  botToken: process.env.BOT_TOKEN,
  
  // MongoDB
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/study-tracker",
  
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
  
  return true;
};

module.exports = { config, validateConfig };
