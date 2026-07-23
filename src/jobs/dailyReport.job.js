// Scheduled job - send daily reports
const cron = require("node-cron");
const { config } = require("../config");
const {
  getActiveNotificationUsers,
  prepareDailyReportData,
  sendDailyReports,
} = require("../services");
const { isHoliday } = require("../services/holiday.service");

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
    // Holiday check
    const holidayCheck = await isHoliday(new Date());
    if (holidayCheck.isHoliday) {
      console.log(
        `🎉 Bugun dam olish kuni: ${holidayCheck.holiday.name}. Hisobotlar yuborilmaydi.`
      );
      return;
    }

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
    let skippedNoLesson = 0;

    for (const tgUser of tgUsers) {
      const reportData = await prepareDailyReportData(tgUser, today);
      if (!reportData) {
        continue;
      }

      // Dars jadvaliga ko'ra bugun dars bo'lmasa (va baho ham qo'yilmagan bo'lsa),
      // bu o'quvchi uchun hisobot yuborilmaydi.
      // Masalan: shanba kuni ayrim sinflarda dars o'tkazilmaydi -
      // bunday holatda "Darsda qatnashmadi" xabari yuborilmasligi kerak.
      if (!reportData.hasSchedule && !reportData.hasGrades) {
        skippedNoLesson++;
        continue;
      }

      reportDataList.push(reportData);
    }

    console.log(
      `📊 Prepared ${reportDataList.length} reports (skipped ${skippedNoLesson} - bugun dars yo'q)`
    );

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
 * Start scheduler — node-cron (server bilan bir xil mexanizm).
 * Har kuni belgilangan vaqtda (Dushanba-Shanba, yakshanba emas) hisobot yuboradi.
 */
const startScheduler = () => {
  const [hours, minutes] = config.dailyReportTime.split(":").map(Number);

  // Cron: daqiqa soat * * 1-6 (Dushanba-Shanba), timezone bilan
  cron.schedule(
    `${minutes} ${hours} * * 1-6`,
    () => {
      sendDailyReportsJob();
    },
    { timezone: config.timezone }
  );

  console.log(
    `⏰ Scheduler started (node-cron). Daily reports at ${config.dailyReportTime} (${config.timezone}), Mon-Sat`
  );
};

module.exports = {
  startScheduler,
  setBotInstance,
  sendDailyReportsJob,
};
