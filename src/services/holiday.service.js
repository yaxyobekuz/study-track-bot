// Holiday service (Prisma) — Mongoose Holiday.isHoliday static'i o'rnini bosadi.
const prisma = require("../config/prisma");

/**
 * Berilgan sana dam olish kuniga to'g'ri kelishini tekshiradi.
 * @param {Date} date
 * @returns {Promise<{isHoliday: boolean, holiday: Object|null}>}
 */
const isHoliday = async (date) => {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  const holidays = await prisma.holiday.findMany({ where: { isActive: true } });

  for (const holiday of holidays) {
    // Bir kunlik dam olish
    if (holiday.type === "single" && holiday.date) {
      const holidayDate = new Date(holiday.date);
      holidayDate.setHours(0, 0, 0, 0);
      if (holidayDate.getTime() === checkDate.getTime()) {
        return { isHoliday: true, holiday };
      }
    }

    // Vaqt oralig'i
    if (holiday.type === "range" && holiday.startDate && holiday.endDate) {
      const start = new Date(holiday.startDate);
      const end = new Date(holiday.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      if (checkDate >= start && checkDate <= end) {
        return { isHoliday: true, holiday };
      }
    }

    // Har yili takrorlanuvchi
    if (holiday.type === "recurring") {
      const month = checkDate.getMonth();
      const day = checkDate.getDate();

      // Bir kunlik takrorlanuvchi (recurringDate JSONB: { month, day })
      if (holiday.recurringDate && holiday.recurringDate.month !== undefined) {
        if (
          holiday.recurringDate.month === month &&
          holiday.recurringDate.day === day
        ) {
          return { isHoliday: true, holiday };
        }
      }

      // Oraliq takrorlanuvchi
      if (
        holiday.recurringStartDate &&
        holiday.recurringEndDate &&
        holiday.recurringStartDate.month !== undefined &&
        holiday.recurringEndDate.month !== undefined
      ) {
        const startMonth = holiday.recurringStartDate.month;
        const startDay = holiday.recurringStartDate.day;
        const endMonth = holiday.recurringEndDate.month;
        const endDay = holiday.recurringEndDate.day;

        if (startMonth > endMonth) {
          if (
            month > startMonth ||
            month < endMonth ||
            (month === startMonth && day >= startDay) ||
            (month === endMonth && day <= endDay)
          ) {
            return { isHoliday: true, holiday };
          }
        } else {
          const startCheck =
            month > startMonth || (month === startMonth && day >= startDay);
          const endCheck =
            month < endMonth || (month === endMonth && day <= endDay);

          if (startCheck && endCheck) {
            return { isHoliday: true, holiday };
          }
        }
      }
    }
  }

  return { isHoliday: false, holiday: null };
};

module.exports = { isHoliday };
