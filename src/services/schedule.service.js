// Schedule service (Prisma)
const prisma = require("../config/prisma");

/**
 * Get day name in Uzbek
 * @param {Date} date
 * @returns {string}
 */
const getDayNameInUzbek = (date = new Date()) => {
  const dayNames = [
    "yakshanba", // Sunday (0)
    "dushanba", // Monday (1)
    "seshanba", // Tuesday (2)
    "chorshanba", // Wednesday (3)
    "payshanba", // Thursday (4)
    "juma", // Friday (5)
    "shanba", // Saturday (6)
  ];
  return dayNames[date.getDay()];
};

/**
 * Get today's schedule for a student's class
 * @param {string} classId - Class ID
 * @param {string} className - Class name
 * @param {Date} date - Date to get schedule for
 * @returns {Array} - Array of subjects with their details
 */
const getScheduleForClass = async (classId, className, date = new Date()) => {
  try {
    const dayName = getDayNameInUzbek(date);

    // Yakshanba (Sunday) - no classes
    if (dayName === "yakshanba") {
      return [];
    }

    const schedule = await prisma.schedule.findUnique({
      where: { classId_day: { classId, day: dayName } },
      include: { lessons: { orderBy: { position: "asc" } } },
    });

    if (!schedule || !schedule.lessons || schedule.lessons.length === 0) {
      return [];
    }

    // subjectId — scalar (relation yo'q), fan nomlarini qo'lda yuklaymiz
    const subjectIds = [...new Set(schedule.lessons.map((l) => l.subjectId).filter(Boolean))];
    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true },
    });
    const subjMap = new Map(subjects.map((s) => [s.id, s]));

    // Sort by order and return subjects with detailed info
    return schedule.lessons
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        lessonId: `${classId}_${item.subjectId}_${item.order}`, // Unique identifier
        classId,
        className,
        subjectId: item.subjectId,
        subjectName: subjMap.get(item.subjectId)?.name || "",
        order: item.order,
      }));
  } catch (error) {
    console.error("Get schedule for class error:", error);
    return [];
  }
};

/**
 * Get today's schedule for a student (from ALL classes)
 * @param {Object} student - Student object with populated classes
 * @param {Date} date - Date to get schedule for
 * @returns {Array} - Array of all lessons from all classes
 */
const getScheduleForStudent = async (student, date = new Date()) => {
  try {
    // If student has no classes or classes not populated
    if (!student.classes || student.classes.length === 0) {
      return [];
    }

    // Get schedules from ALL classes
    const allLessons = [];

    for (const classItem of student.classes) {
      const classId = classItem.id || classItem;
      const className = classItem.name || "Sinf";

      const classSchedule = await getScheduleForClass(classId, className, date);
      allLessons.push(...classSchedule);
    }

    // Sort all lessons by order (to maintain proper sequence)
    allLessons.sort((a, b) => a.order - b.order);

    return allLessons;
  } catch (error) {
    console.error("Get schedule for student error:", error);
    return [];
  }
};

module.exports = {
  getDayNameInUzbek,
  getScheduleForClass,
  getScheduleForStudent,
};
