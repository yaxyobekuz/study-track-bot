// Grade service (Prisma)
const prisma = require("../config/prisma");
const { getScheduleForStudent } = require("./schedule.service");

// Grade ref (subject/teacher) larni qo'lda yuklab tekislaydi (relation YO'Q)
async function attachGradeRefs(grades) {
  const arr = Array.isArray(grades) ? grades : [grades];
  const subjectIds = [...new Set(arr.map((g) => g.subjectId).filter(Boolean))];
  const teacherIds = [...new Set(arr.map((g) => g.teacherId).filter(Boolean))];

  const [subjects, teachers] = await Promise.all([
    subjectIds.length
      ? prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } })
      : [],
    teacherIds.length
      ? prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } })
      : [],
  ]);
  const sMap = new Map(subjects.map((s) => [s.id, { ...s }]));
  const tMap = new Map(teachers.map((t) => [t.id, { ...t }]));

  return arr.map((g) => ({
    ...g,
    subject: g.subjectId ? sMap.get(g.subjectId) || null : null,
    teacher: g.teacherId ? tMap.get(g.teacherId) || null : null,
  }));
}

/**
 * O'quvchining bugungi baholarini olish
 * @param {string} studentId
 * @param {Date} date
 * @returns {Array}
 */
const getStudentGradesByDate = async (studentId, date = new Date()) => {
  try {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const grades = await prisma.grade.findMany({
      where: { studentId, date: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: "asc" },
    });

    return attachGradeRefs(grades);
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
    const tgUsers = await prisma.tgUser.findMany({
      where: { isActive: true, notificationsEnabled: true },
    });

    // student — scalar String (relation yo'q), qo'lda yuklaymiz
    const studentIds = [...new Set(tgUsers.map((t) => t.student).filter(Boolean))];
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true, firstName: true, lastName: true, isActive: true,
        classes: { include: { class: { select: { id: true, name: true } } } },
      },
    });
    const sMap = new Map(
      students.map((s) => [
        s.id,
        { ...s, classes: s.classes.map((uc) => ({ ...uc.class })) },
      ]),
    );

    // Return only active students
    return tgUsers
      .map((tgUser) => ({ ...tgUser, student: sMap.get(tgUser.student) || null }))
      .filter((tgUser) => tgUser.student && tgUser.student.isActive);
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
    const grades = await getStudentGradesByDate(tgUser.student.id, date);
    const schedule = await getScheduleForStudent(tgUser.student, date);

    return {
      tgUser,
      student: tgUser.student,
      grades,
      schedule,
      date,
      hasGrades: grades.length > 0,
      hasSchedule: schedule.length > 0,
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
    await prisma.tgUser.updateMany({
      where: { telegramId: telegramId.toString() },
      data: { notificationsEnabled: enabled },
    });
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

    const rawGrades = await prisma.grade.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: "asc" },
    });
    const grades = await attachGradeRefs(rawGrades);

    // O'quvchi ID bo'yicha guruh
    const gradesByStudent = new Map();

    for (const grade of grades) {
      const studentId = String(grade.studentId);
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
