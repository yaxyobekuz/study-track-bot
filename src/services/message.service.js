// Message sending service
const { config } = require("../config");
const TEXTS = require("../data/texts.data");

/**
 * Oy nomlari — kanonik sana formati uchun ("21-may, 2025").
 * `getMonth()` tartibida (0 = yanvar).
 */
const MONTHS_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/**
 * Oy nomlari BOSH HARF bilan — oy yorlig'i uchun ("Yanvar, 2026").
 * Serverdagi `MONTHS_UZ_CAP` bilan bir xil hosila.
 */
const MONTHS_UZ_CAP = MONTHS_UZ.map((m) => m[0].toUpperCase() + m.slice(1));

/** Toshkent (UTC+5) siljishi — instantni devor-soatiga surish uchun. */
const TASHKENT_OFFSET_MS = 5 * 3600000;

/**
 * Kanonik sana: "21-may, 2025".
 *
 * ⚠️ Tizimda sana FAQAT shu ko'rinishda ko'rsatiladi — ota-ona botdan
 * "21.05.2025", panelda esa "21-may, 2025" ko'rmasligi kerak.
 * To'liq qoida: `.claude/rules/dates.md`.
 *
 * @param {Date|string|number} date
 * @param {{utc?: boolean}} [options] `utc: true` — qiymat UTC YARIM TUNIDA
 *   saqlangan KUN (`attendances.date`, `grades.date`): u devor-soatiga
 *   surilmaydi, aks holda bot UTC'dan orqadagi zonada ishlaganda sana bir
 *   kunga siljirdi. Serverdagi `formatDateUz(v, { utc: true })` bilan ayni
 *   qoida.
 * @returns {string}
 */
const formatDate = (date, { utc = false } = {}) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  if (!utc) {
    return `${d.getDate()}-${MONTHS_UZ[d.getMonth()]}, ${d.getFullYear()}`;
  }
  return `${d.getUTCDate()}-${MONTHS_UZ[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
};

/**
 * Kanonik vaqt: "14:30" — TOSHKENT devor-soati.
 *
 * Serverdagi `formatTimeUz` bilan ayni hisob: instant Toshkent siljishiga
 * suriladi, so'ng `getUTC*` bilan o'qiladi. `toLocaleTimeString`
 * ISHLATILMAYDI — natija Node ICU qurilishiga bog'liq bo'lib qolardi
 * (`dates.md` bilan bir xil sabab).
 *
 * @param {Date|string|number|null} value
 * @param {{fallback?: string}} [options]
 * @returns {string}
 */
const formatTime = (value, { fallback = "—" } = {}) => {
  if (value === null || value === undefined || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  const shifted = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

/**
 * Oy yorlig'i: 202601 → "Yanvar, 2026".
 * Serverdagi `month.helpers#formatMonthKey` bilan bir xil.
 *
 * @param {number} monthKey - YYYYMM
 * @returns {string}
 */
const formatMonth = (monthKey) => {
  if (monthKey == null) return "";
  const name = MONTHS_UZ_CAP[(monthKey % 100) - 1];
  return name ? `${name}, ${Math.trunc(monthKey / 100)}` : String(monthKey);
};

/**
 * Summa ODAM o'qiydigan matnda: "6 741 000 so'm" (butun so'mgacha).
 *
 * Serverdagi `money.helpers#formatSum` ning ko'zgusi — bot va panel bitta
 * oylikni boshqa-boshqa ko'rsatmasligi kerak. `toLocaleString` siz: ajratgich
 * Node ICU qurilishiga bog'liq bo'lib qolmasin.
 *
 * @param {*} value - Prisma Decimal, son yoki satr
 * @returns {string}
 */
const formatSum = (value) => {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const grouped = Math.round(safe)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} so'm`;
};

/**
 * Markdown maxsus belgilaridan himoya qilish.
 * Foydalanuvchi ismi/sinf nomida `_ * [ \`` bo'lsa, Telegram parse_mode: "Markdown"
 * butun xabarni rad etadi va xabar jimgina yuborilmay qoladi. Shu sababli
 * dinamik qiymatlarni xabarga qo'yishdan oldin escape qilamiz.
 * @param {string} text
 * @returns {string}
 */
const escapeMarkdown = (text = "") => String(text).replace(/([_*`[])/g, "\\$1");

/**
 * Kunlik hisobot xabarini tayyorlash
 * @param {Object} reportData
 * @returns {string}
 */
const formatDailyReport = (reportData) => {
  const { student, grades, schedule, date, hasGrades, hasSchedule } = reportData;
  const studentName = student.fullName || `${student.firstName} ${student.lastName || ""}`.trim();
  const formattedDate = formatDate(date);

  // If no schedule and no grades
  if (!hasGrades && !hasSchedule) {
    return TEXTS.NO_GRADES_TODAY(studentName, formattedDate);
  }

  let message = TEXTS.DAILY_REPORT_HEADER(studentName, formattedDate);
  message += "\n";

  // Check if student is in multiple classes
  const hasMultipleClasses = student.classes && student.classes.length > 1;

  if (hasSchedule && hasMultipleClasses) {
    // Group lessons and grades by class
    const classesByName = new Map();
    
    // Create a map of grades by subject ID and lessonOrder
    const gradesByKey = new Map();
    for (const grade of grades) {
      const subjectId = grade.subject.id.toString();
      const lessonOrder = grade.lessonOrder || 1;
      const key = `${subjectId}_${lessonOrder}`;
      gradesByKey.set(key, grade);
    }

    // Group schedule by class
    for (const lesson of schedule) {
      const className = lesson.className;
      if (!classesByName.has(className)) {
        classesByName.set(className, []);
      }
      classesByName.get(className).push(lesson);
    }

    // Display by class
    for (const [className, lessons] of classesByName) {
      message += `\n*${className}*\n`;
      
      for (const lesson of lessons) {
        const subjectId = lesson.subjectId.toString();
        const subjectName = lesson.subjectName;
        const lessonOrder = lesson.order || 1;
        const key = `${subjectId}_${lessonOrder}`;

        // Check if student has grades for this subject at this lessonOrder
        if (gradesByKey.has(key)) {
          const gradeObj = gradesByKey.get(key);
          message += TEXTS.GRADE_LINE(subjectName, gradeObj.grade, gradeObj.comment) + "\n";
        } else {
          message += TEXTS.NO_GRADE_LINE(subjectName) + "\n";
        }
      }
    }

    // Average grade (only from graded subjects)
    if (hasGrades) {
      const avgGrade = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length;
      message += `\n📈 *O'rtacha baho:* ${avgGrade.toFixed(1)}`;
    }
  } else if (hasSchedule) {
    // Single class - display without class grouping
    const gradesByKey = new Map();
    for (const grade of grades) {
      const subjectId = grade.subject.id.toString();
      const lessonOrder = grade.lessonOrder || 1;
      const key = `${subjectId}_${lessonOrder}`;
      gradesByKey.set(key, grade);
    }

    // Display all lessons from schedule
    for (const lesson of schedule) {
      const subjectId = lesson.subjectId.toString();
      const subjectName = lesson.subjectName;
      const lessonOrder = lesson.order || 1;
      const key = `${subjectId}_${lessonOrder}`;

      // Check if student has grades for this subject at this lessonOrder
      if (gradesByKey.has(key)) {
        const gradeObj = gradesByKey.get(key);
        message += TEXTS.GRADE_LINE(subjectName, gradeObj.grade, gradeObj.comment) + "\n";
      } else {
        message += TEXTS.NO_GRADE_LINE(subjectName) + "\n";
      }
    }

    // Average grade (only from graded subjects)
    if (hasGrades) {
      const avgGrade = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length;
      message += `\n📈 *O'rtacha baho:* ${avgGrade.toFixed(1)}`;
    }
  } else {
    // Fallback: No schedule available, show only graded subjects
    if (!hasGrades) {
      return TEXTS.NO_GRADES_TODAY(studentName, formattedDate);
    }

    // Group grades by class if multiple classes
    if (hasMultipleClasses) {
      const gradesByClass = new Map();
      
      for (const grade of grades) {
        const className = grade.class?.name || "Boshqa";
        if (!gradesByClass.has(className)) {
          gradesByClass.set(className, []);
        }
        gradesByClass.get(className).push(grade);
      }

      // Display by class
      for (const [className, classGrades] of gradesByClass) {
        message += `\n*${className}*\n`;
        
        for (const gradeObj of classGrades) {
          const subjectName = gradeObj.subject.name;
          message += TEXTS.GRADE_LINE(subjectName, gradeObj.grade, gradeObj.comment) + "\n";
        }
      }
    } else {
      // Single class - display without grouping
      for (const gradeObj of grades) {
        const subjectName = gradeObj.subject.name;
        message += TEXTS.GRADE_LINE(subjectName, gradeObj.grade, gradeObj.comment) + "\n";
      }
    }

    // Average grade
    const avgGrade = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length;
    message += `\n📈 *O'rtacha baho:* ${avgGrade.toFixed(1)}`;
  }

  return message;
};

/* ══════════════════════════════════════════════════════════════════════
   XODIM XABARLARI

   ⚠️ HAR BIR DINAMIK QIYMAT `escapeMarkdown` DAN O'TADI. Topshiriq
   sarlavhasi, sinf/fan nomi, lavozim va sabab matnini ODAM yozadi va
   ularda `_ * [ \`` bo'lishi mumkin: Telegram `parse_mode: "Markdown"`
   bilan butun xabarni RAD ETADI, ya'ni bot jimgina "qotib qolgandek"
   ko'rinadi. O'quvchi oqimida bu bir marta boshdan kechirilgan
   (`AUTH_SUCCESS` izohi).
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Xodimning bugungi davomati.
 *
 * @param {{record: object|null, workTime: object|null, date: Date}} data
 * @returns {string}
 */
const formatStaffAttendance = ({ record, workTime, date }) => {
  // ⚠️ `utc: true` — `attendances.date` Toshkent kunini UTC yarim tunida
  // saqlaydi (`formatDate` izohi).
  let message = TEXTS.STAFF_ATTENDANCE_HEADER(formatDate(date, { utc: true }));

  if (workTime) {
    message += `${TEXTS.STAFF_WORK_TIME(workTime.startTime, workTime.endTime)}\n`;
  }

  if (!record) {
    return `${message}\n${TEXTS.STAFF_ATTENDANCE_NONE}`;
  }

  message += "\n";
  message +=
    (TEXTS.STAFF_ATTENDANCE_STATUS[record.status] ||
      TEXTS.STAFF_ATTENDANCE_STATUS.present) + "\n";

  if (record.checkIn) {
    message += `${TEXTS.STAFF_CHECK_IN(formatTime(record.checkIn))}\n`;
  }

  if (record.isLate && record.lateMinutes > 0) {
    message += `${TEXTS.STAFF_LATE_MINUTES(record.lateMinutes)}\n`;
  }

  // ⚠️ Kelgan, lekin hali ketmagan holat ALOHIDA ko'rsatiladi: bo'sh
  // qoldirilsa xodim "ketishim yozilmaganmi?" deb o'ylab qolardi.
  if (record.checkOut) {
    message += `${TEXTS.STAFF_CHECK_OUT(formatTime(record.checkOut))}\n`;
  } else if (record.checkIn) {
    message += `${TEXTS.STAFF_CHECK_OUT_PENDING}\n`;
  }

  if (record.isEarlyOut && record.earlyOutMinutes > 0) {
    message += `${TEXTS.STAFF_EARLY_OUT_MINUTES(record.earlyOutMinutes)}\n`;
  }

  if (record.excuseReason) {
    message += `${TEXTS.STAFF_EXCUSE_REASON(escapeMarkdown(record.excuseReason))}\n`;
  }

  return message.trimEnd();
};

/**
 * Xodimning topshiriqlari.
 *
 * @param {{open: Array, reviewCount: number, overdue: Array, penaltyPoints: number}} data
 * @returns {string}
 */
const formatStaffTasks = ({ open, reviewCount, overdue, penaltyPoints }) => {
  let message = TEXTS.STAFF_TASKS_HEADER;

  if (open.length === 0) {
    message += `\n${TEXTS.STAFF_TASKS_EMPTY}`;
  } else {
    const now = new Date();
    message += "\n";

    for (const task of open) {
      const isOverdue = task.dueDate < now;
      message +=
        TEXTS.STAFF_TASK_LINE(
          escapeMarkdown(task.title),
          // Muddat — INSTANT (`due_date` timestamp), ya'ni `utc` bayrog'i
          // qo'yilmaydi va Toshkent devor-soatiga suriladi.
          `${formatDate(task.dueDate)} ${formatTime(task.dueDate)}`,
          isOverdue,
        ) + "\n";
    }

    if (overdue.length > 0) {
      message += TEXTS.STAFF_TASKS_OVERDUE_WARN(overdue.length) + "\n";
    }
  }

  if (reviewCount > 0) {
    message += TEXTS.STAFF_TASKS_REVIEW(reviewCount) + "\n";
  }

  if (penaltyPoints > 0) {
    message += TEXTS.STAFF_PENALTY_POINTS(penaltyPoints) + "\n";
  }

  return message.trimEnd();
};

/**
 * O'qituvchining bugungi darslari.
 *
 * @param {{dayName: string, lessons: Array, gradedCount: number}} data
 * @param {Date} date
 * @returns {string}
 */
const formatStaffLessons = ({ dayName, lessons, gradedCount }, date) => {
  let message = TEXTS.STAFF_LESSONS_HEADER(
    dayName,
    formatDate(date, { utc: true }),
  );

  if (lessons.length === 0) {
    return `${message}\n${TEXTS.STAFF_LESSONS_EMPTY}`;
  }

  message += "\n";

  for (const lesson of lessons) {
    // `startTime`/`endTime` — jadvaldagi "HH:MM" SATRLARI, instant emas:
    // ular formatlanmaydi, shunchaki ko'rsatiladi.
    const timeLabel =
      lesson.startTime && lesson.endTime
        ? `${lesson.startTime} – ${lesson.endTime}`
        : "";

    message +=
      TEXTS.STAFF_LESSON_LINE(
        lesson.order,
        escapeMarkdown(lesson.className),
        escapeMarkdown(lesson.subjectName),
        timeLabel,
        lesson.graded,
      ) + "\n";
  }

  message += TEXTS.STAFF_LESSONS_SUMMARY(gradedCount, lessons.length);

  return message.trimEnd();
};

/**
 * Xodimning oyligi.
 *
 * @param {{entry: object|null, isCurrentMonth: boolean, monthKey: number}} data
 * @returns {string}
 */
const formatStaffPayroll = ({ entry, isCurrentMonth, monthKey }) => {
  if (!entry) {
    return `${TEXTS.STAFF_PAYROLL_HEADER(formatMonth(monthKey))}\n${TEXTS.STAFF_PAYROLL_EMPTY}`;
  }

  let message = TEXTS.STAFF_PAYROLL_HEADER(formatMonth(entry.month));

  if (entry.positionName) {
    message += `${TEXTS.STAFF_PAYROLL_POSITION(escapeMarkdown(entry.positionName))}\n`;
  }
  if (entry.categoryName) {
    message += `${TEXTS.STAFF_PAYROLL_CATEGORY(escapeMarkdown(entry.categoryName))}\n`;
  }

  message += "\n";

  // ⚠️ BEKOR QILINGAN QATOR — summalar o'z o'rnida turadi (tarix
  // o'chirilmaydi), lekin ularni "men shuncha olaman" deb o'qimasligi uchun
  // eng tepada aytiladi.
  if (entry.cancelledAt) {
    message += `${TEXTS.STAFF_PAYROLL_CANCELLED}\n\n`;
  }

  const total = Number(entry.amount ?? 0);
  const paid = Number(entry.paidAmount ?? 0);

  message += `${TEXTS.STAFF_PAYROLL_TOTAL(formatSum(total))}\n`;
  message += `${TEXTS.STAFF_PAYROLL_PAID(formatSum(paid))}\n`;

  const remaining = total - paid;
  if (remaining > 0) {
    message += `${TEXTS.STAFF_PAYROLL_REMAINING(formatSum(remaining))}\n`;
  }

  message +=
    (TEXTS.STAFF_PAYROLL_STATUS[entry.status] ||
      TEXTS.STAFF_PAYROLL_STATUS.unpaid) + "\n";

  // ── Tarkibi — faqat NOLDAN FARQLI qismlar ──
  const parts = [];
  const fixed = Number(entry.fixedAmount ?? 0);
  const kpi = Number(entry.kpiAmount ?? 0);
  const allowance = Number(entry.allowanceAmount ?? 0);
  const deduction = Number(entry.deductionAmount ?? 0);
  const absence = Number(entry.absenceAmount ?? 0);
  const suspended = Number(entry.suspendedAmount ?? 0);
  const hours = Number(entry.lessonHours ?? 0);

  if (fixed > 0) parts.push(TEXTS.STAFF_PAYROLL_FIXED(formatSum(fixed)));
  if (kpi > 0) parts.push(TEXTS.STAFF_PAYROLL_KPI(formatSum(kpi), hours || null));
  if (allowance > 0) parts.push(TEXTS.STAFF_PAYROLL_ALLOWANCE(formatSum(allowance)));
  if (absence > 0) parts.push(TEXTS.STAFF_PAYROLL_ABSENCE(formatSum(absence)));
  if (suspended > 0) parts.push(TEXTS.STAFF_PAYROLL_SUSPENDED(formatSum(suspended)));
  if (deduction > 0) parts.push(TEXTS.STAFF_PAYROLL_DEDUCTION(formatSum(deduction)));

  if (parts.length > 0) {
    message += `${TEXTS.STAFF_PAYROLL_BREAKDOWN_HEADER}\n${parts.join("\n")}\n`;
  }

  if (!isCurrentMonth) {
    message += TEXTS.STAFF_PAYROLL_NOT_CURRENT;
  }

  return message.trimEnd();
};

/**
 * Xabar yuborish (rate limit bilan)
 * @param {Object} bot - Telegram bot instance
 * @param {string} chatId 
 * @param {string} message 
 * @param {Object} options 
 * @returns {Promise<boolean>}
 */
const sendMessage = async (bot, chatId, message, options = {}) => {
  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      ...options
    });
    return true;
  } catch (error) {
    console.error(`Send message error (chatId: ${chatId}):`, error.message);
    return false;
  }
};

/**
 * Delay
 * @param {number} ms 
 * @returns {Promise}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Send batch messages (considering rate limits)
 * @param {Object} bot - Telegram bot instance
 * @param {Array} messages - [{chatId, message, options}]
 * @returns {Object} - {sent, failed}
 */
const sendBatchMessages = async (bot, messages) => {
  const results = { sent: 0, failed: 0 };
  const { messageDelayMs, batchSize, batchDelayMs } = config;

  for (let i = 0; i < messages.length; i++) {
    const { chatId, message, options } = messages[i];
    
    const success = await sendMessage(bot, chatId, message, options);
    if (success) {
      results.sent++;
    } else {
      results.failed++;
    }

    // Delay between each message
    if (i < messages.length - 1) {
      await delay(messageDelayMs);
    }

    // Larger delay after batch completion
    if ((i + 1) % batchSize === 0 && i < messages.length - 1) {
      console.log(`📤 Batch ${Math.floor((i + 1) / batchSize)} completed. Waiting...`);
      await delay(batchDelayMs);
    }
  }

  return results;
};

/**
 * Send daily reports to all users
 * @param {Object} bot - Telegram bot instance
 * @param {Array} reportDataList 
 * @returns {Object}
 */
const sendDailyReports = async (bot, reportDataList) => {
  const { track } = require("./activity.service");

  console.log(`📊 Sending ${reportDataList.length} daily reports...`);

  const results = { sent: 0, failed: 0 };
  const { messageDelayMs, batchSize, batchDelayMs } = config;

  // ⚠️ `sendBatchMessages` DAN FOYDALANMAYDI va bu ataylab: bu yerda har
  // xabarning natijasi KIMGA tegishli ekani kerak. Kunlik hisobot —
  // ota-onalarga boradigan eng katta oqim va u hech qayerda qayd
  // etilmasdi (`Message` qatori ham yaratilmaydi), ya'ni "kecha 240 ta
  // ota-onaga yubordik, 12 tasi botni bloklagan" degan savol javobsiz
  // qolardi.
  //
  // ⚠️ Hodisa `bot.out.` prefiksi bilan — u BIZ yuborgan xabar,
  // foydalanuvchi harakati EMAS va faol foydalanuvchi sanog'iga
  // kirmaydi (`activity.service.js` dagi izoh).
  for (let i = 0; i < reportDataList.length; i++) {
    const reportData = reportDataList[i];
    const { tgUser } = reportData;

    const success = await sendMessage(
      bot,
      tgUser.chatId,
      formatDailyReport(reportData),
      {},
    );

    if (success) results.sent++;
    else results.failed++;

    track({
      telegramId: tgUser.telegramId,
      // ⚠️ `tgUser.student` bu bosqichda OBYEKT (`getActiveNotificationUsers`
      // uni qo'lda yuklaydi), satr emas — shuning uchun `.id` olinadi
      studentId: reportData.student?.id ?? tgUser.student?.id ?? null,
      action: success ? "bot.out.report" : "bot.out.failed",
      meta: { hasGrades: Boolean(reportData.hasGrades) },
    });

    // Har xabar orasidagi kechikish
    if (i < reportDataList.length - 1) {
      await delay(messageDelayMs);
    }

    // Partiya tugagach kattaroq kechikish
    if ((i + 1) % batchSize === 0 && i < reportDataList.length - 1) {
      console.log(
        `📤 Batch ${Math.floor((i + 1) / batchSize)} completed. Waiting...`,
      );
      await delay(batchDelayMs);
    }
  }

  console.log(`✅ Reports sent: ${results.sent}, Failed: ${results.failed}`);

  return results;
};

module.exports = {
  formatDate,
  formatTime,
  formatMonth,
  formatSum,
  escapeMarkdown,
  formatDailyReport,
  formatStaffAttendance,
  formatStaffTasks,
  formatStaffLessons,
  formatStaffPayroll,
  sendMessage,
  sendBatchMessages,
  sendDailyReports,
  delay,
};
