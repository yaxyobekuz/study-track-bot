// Schedule service
const { Schedule } = require("../models");

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
 * @param {string} classId - Class ObjectId
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

    const schedule = await Schedule.findOne({
      class: classId,
      day: dayName,
    }).populate("subjects.subject", "name");

    if (!schedule || !schedule.subjects) {
      return [];
    }

    // Sort by order and return subjects with detailed info
    return schedule.subjects
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        lessonId: `${classId}_${item.subject._id}_${item.order}`, // Unique identifier
        classId: classId,
        className: className,
        subjectId: item.subject._id,
        subjectName: item.subject.name,
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
      const classId = classItem._id || classItem;
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
