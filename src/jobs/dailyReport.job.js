// Scheduled job - send daily reports
const { config } = require("../config");
const {
  getActiveNotificationUsers,
  prepareDailyReportData,
  sendDailyReports,
} = require("../services");

// Bot instance global variable
let botInstance = null;

/**
 * Bot instanceni sozlash
 * @param {Object} bot
 */
const setBotInstance = (bot) => {
  botInstance = bot;
};

/**
 * Daily report sending task
 */
const sendDailyReportsJob = async () => {
  console.log("📅 Starting daily reports job...");

  if (!botInstance) {
    console.error("❌ Bot instance not set!");
    return;
  }

  try {
    // Get active users
    const tgUsers = await getActiveNotificationUsers();
    console.log(`👥 Found ${tgUsers.length} active users`);

    if (tgUsers.length === 0) {
      console.log("ℹ️ No users to send reports to");
      return;
    }

    // Prepare report data for each user
    const today = new Date();
    const reportDataList = [];

    for (const tgUser of tgUsers) {
      const reportData = await prepareDailyReportData(tgUser, today);
      if (reportData) {
        reportDataList.push(reportData);
      }
    }

    console.log(`📊 Prepared ${reportDataList.length} reports`);

    // Send reports
    const results = await sendDailyReports(botInstance, reportDataList);
    console.log(
      `✅ Daily reports job completed. Sent: ${results.sent}, Failed: ${results.failed}`
    );
  } catch (error) {
    console.error("❌ Daily reports job error:", error);
  }
};

/**
 * Start scheduler
 * Use simple setInterval and setTimeout instead of node-cron
 */
const startScheduler = () => {
  const [hours, minutes] = config.dailyReportTime.split(":").map(Number);

  console.log(
    `⏰ Scheduler started. Daily reports will be sent at ${config.dailyReportTime}`
  );

  // Check every minute
  const checkAndRun = () => {
    const now = new Date();

    // Simple timezone handling
    if (now.getHours() === hours && now.getMinutes() === minutes) {
      // Check for Sunday (0 = Sunday)
      if (now.getDay() === 0) {
        console.log("ℹ️ Sunday - skipping daily reports");
      } else {
        sendDailyReportsJob();
      }
    }
  };

  // Check every minute
  setInterval(checkAndRun, 60 * 1000);

  // First check
  const now = new Date();
  console.log(`📅 Current time: ${now.getHours()}:${now.getMinutes()}`);
  console.log(`📅 Next report time: ${hours}:${minutes}`);
};

/**
 * Scheduler with Agenda (for production)
 * Can be added if Agenda is needed
 */
const startAgendaScheduler = async () => {
  const Agenda = require("agenda");

  const agenda = new Agenda({
    db: { address: config.mongodbUri, collection: "scheduledJobs" },
  });

  // Job ni aniqlash
  agenda.define("send daily reports", async (job) => {
    console.log("📅 Agenda: Running daily reports job");
    await sendDailyReportsJob();
  });

  // Xatolarni ushlash
  agenda.on("fail", (err, job) => {
    console.error(`❌ Agenda job failed: ${job.attrs.name}`, err);
  });

  await agenda.start();

  // Kunlik hisobot yuborish jobini rejalashtirish
  const [hours, minutes] = config.dailyReportTime.split(":").map(Number);

  // Mavjud joblarni o'chirish va yangisini yaratish
  await agenda.cancel({ name: "send daily reports" });

  // Har kuni belgilangan vaqtda ishga tushirish
  // Cron format: sekund daqiqa soat kun oy hafta_kuni
  await agenda.every(
    `${minutes} ${hours} * * 1-6`, // Dushanba-Shanba, yakshanba emas
    "send daily reports",
    {},
    { timezone: config.timezone }
  );

  console.log(
    `⏰ Agenda scheduler started. Daily reports at ${config.dailyReportTime}`
  );

  return agenda;
};

module.exports = {
  startScheduler,
  setBotInstance,
  sendDailyReportsJob,
  startAgendaScheduler,
};
