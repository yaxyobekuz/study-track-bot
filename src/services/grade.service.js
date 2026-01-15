// Grade service
const { Grade, TgUser, User } = require("../models");

/**
 * O'quvchining bugungi baholarini olish
 * @param {string} studentId
 * @param {Date} date
 * @returns {Array}
 */
const getStudentGradesByDate = async (studentId, date = new Date()) => {
  try {
    // Get date from start to end of day
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const grades = await Grade.find({
      student: studentId,
      date: { $gte: startDate, $lte: endDate },
    })
      .populate("subject", "name")
      .populate("teacher", "firstName lastName")
      .sort({ createdAt: 1 });

    return grades;
  } catch (error) {
    console.error("Get student grades error:", error);
    return [];
  }
};

/**
 * Get all active TgUsers (for sending notifications)
 * @returns {Array}
 */
const getActiveNotificationUsers = async () => {
  try {
    const tgUsers = await TgUser.find({
      isActive: true,
      notificationsEnabled: true,
    }).populate({
      path: "student",
      select: "firstName lastName fullName class isActive",
      populate: { path: "class", select: "name" },
    });

    // Return only active students
    return tgUsers.filter(
      (tgUser) => tgUser.student && tgUser.student.isActive
    );
  } catch (error) {
    console.error("Get active notification users error:", error);
    return [];
  }
};

/**
 * Prepare daily report data
 * @param {Object} tgUser
 * @param {Date} date
 * @returns {Object}
 */
const prepareDailyReportData = async (tgUser, date = new Date()) => {
  try {
    const grades = await getStudentGradesByDate(tgUser.student._id, date);

    return {
      tgUser,
      student: tgUser.student,
      grades,
      date,
      hasGrades: grades.length > 0,
    };
  } catch (error) {
    console.error("Prepare daily report data error:", error);
    return null;
  }
};

/**
 * Toggle notification settings
 * @param {string} telegramId
 * @param {boolean} enabled
 * @returns {boolean}
 */
const toggleNotifications = async (telegramId, enabled) => {
  try {
    await TgUser.findOneAndUpdate(
      { telegramId: telegramId.toString() },
      { notificationsEnabled: enabled }
    );
    return true;
  } catch (error) {
    console.error("Toggle notifications error:", error);
    return false;
  }
};

/**
 * Daily grades list for all students
 * @param {Date} date
 * @returns {Map<string, Array>}
 */
const getAllStudentGradesForDate = async (date = new Date()) => {
  try {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const grades = await Grade.find({
      date: { $gte: startDate, $lte: endDate },
    })
      .populate("subject", "name")
      .populate("student", "_id")
      .sort({ createdAt: 1 });

    // O'quvchi ID bo'yicha guruh
    const gradesByStudent = new Map();

    for (const grade of grades) {
      const studentId = grade.student._id.toString();
      if (!gradesByStudent.has(studentId)) {
        gradesByStudent.set(studentId, []);
      }
      gradesByStudent.get(studentId).push(grade);
    }

    return gradesByStudent;
  } catch (error) {
    console.error("Get all student grades error:", error);
    return new Map();
  }
};

module.exports = {
  getStudentGradesByDate,
  getActiveNotificationUsers,
  prepareDailyReportData,
  toggleNotifications,
  getAllStudentGradesForDate,
};
