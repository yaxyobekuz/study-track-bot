// Bot entry point
require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const { config, validateConfig } = require("./src/config");
const connectDB = require("./src/config/database");
const { registerHandlers } = require("./src/handlers");
const { setBotInstance, startScheduler } = require("./src/jobs");

// Validate configuration
try {
  validateConfig();
} catch (error) {
  console.error("❌ Configuration error:", error.message);
  process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(config.botToken, { polling: true });

// Catch bot errors
bot.on("polling_error", (error) => {
  console.error("❌ Polling error:", error.code, error.message);
});

bot.on("error", (error) => {
  console.error("❌ Bot error:", error.message);
});

// Main startup function
const start = async () => {
  try {
    // Connect to PostgreSQL (Prisma)
    await connectDB();

    // Set bot instance for jobs
    setBotInstance(bot);

    // Register handlers
    registerHandlers(bot);

    // Start scheduler (node-cron — server bilan bir xil, MongoDB-backed Agenda o'chirildi)
    startScheduler();

    console.log("🤖 Bot started successfully!");
    console.log(`📅 Daily reports will be sent at ${config.dailyReportTime}`);
  } catch (error) {
    console.error("❌ Start error:", error);
    process.exit(1);
  }
};

// Handle process termination signals
process.on("SIGINT", () => {
  console.log("\n👋 Bot stopped");
  bot.stopPolling();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Bot stopped");
  bot.stopPolling();
  process.exit(0);
});

// Start the bot
start();
