// Message sending service
const { config } = require("../config");
const TEXTS = require("../data/texts.data");

/**
 * Vaqtni formatlash
 * @param {Date} date 
 * @returns {string}
 */
const formatDate = (date) => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

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
      const subjectId = grade.subject._id.toString();
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
      const subjectId = grade.subject._id.toString();
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
  const messages = reportDataList.map(reportData => ({
    chatId: reportData.tgUser.chatId,
    message: formatDailyReport(reportData),
    options: {}
  }));

  console.log(`📊 Sending ${messages.length} daily reports...`);
  const results = await sendBatchMessages(bot, messages);
  console.log(`✅ Reports sent: ${results.sent}, Failed: ${results.failed}`);

  return results;
};

module.exports = {
  formatDate,
  formatDailyReport,
  sendMessage,
  sendBatchMessages,
  sendDailyReports,
  delay,
};
