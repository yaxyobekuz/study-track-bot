// Scheduled job - send daily reports
const cron = require("node-cron");
const { config } = require("../config");
const {
  getActiveNotificationUsers,
  prepareDailyReportData,
  sendDailyReports,
} = require("../services");
const { isHoliday } = require("../services/holiday.service");
const { forEachBranch } = require("../config/branch");


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
 * BITTA FILIAL uchun kunlik hisobot.
 *
 * Dam olish kunlari, dars jadvali va o'quvchilar — hammasi filialga xos,
 * shuning uchun tekshiruvlar ham har filialda alohida bajariladi: bir filialda
 * bayram bo'lishi, boshqasida esa dars davom etishi mumkin.
 *
 * @param {object} branch
 */
const sendReportsForBranch = async (branch) => {
  const tag = `[${branch.name}]`;
  console.log(`📅 ${tag} Kunlik hisobot boshlandi...`);

  try {
    // Holiday check
    const holidayCheck = await isHoliday(new Date());
    if (holidayCheck.isHoliday) {
      console.log(
        `🎉 ${tag} Bugun dam olish kuni: ${holidayCheck.holiday.name}. Hisobotlar yuborilmaydi.`
      );
      return;
    }

    // Get active users
    const tgUsers = await getActiveNotificationUsers();
    console.log(`👥 ${tag} ${tgUsers.length} ta faol foydalanuvchi`);

    if (tgUsers.length === 0) {
      console.log(`ℹ️ ${tag} Hisobot yuboriladigan foydalanuvchi yo'q`);
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
      `📊 ${tag} ${reportDataList.length} ta hisobot tayyor (${skippedNoLesson} ta o'tkazildi — bugun dars yo'q)`
    );

    // Send reports
    const results = await sendDailyReports(botInstance, reportDataList);
    console.log(
      `✅ ${tag} Tugadi. Yuborildi: ${results.sent}, xato: ${results.failed}`
    );
  } catch (error) {
    console.error(`❌ ${tag} Kunlik hisobot xatosi:`, error);
  }
};

/**
 * BARCHA filiallar bo'ylab kunlik hisobot.
 *
 * Ketma-ket: har filial Telegram'ga o'z tezlik chegarasi bilan yuboradi,
 * parallel yuborish esa bitta bot tokeni ustidan limitga urilardi.
 */
const sendDailyReportsJob = async () => {
  if (!botInstance) {
    console.error("❌ Bot instance not set!");
    return;
  }

  console.log("📅 Kunlik hisobot: barcha filiallar...");
  await forEachBranch((branch) => sendReportsForBranch(branch));
  console.log("✅ Kunlik hisobot: barcha filiallar tugadi");
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
