# Claude Code - Bot Module Rules

> Global rules in root CLAUDE.md also apply.

## Structure

- Follow the existing structure in this module.
- Do not introduce new patterns unless the codebase already uses them.

## Ikki oqim: ota-ona va xodim

Botga **har qanday rol** kiradi. Kirgan odamga qarab boshqa menyu ochiladi:

| Oqim | Login | Ko'radi |
|---|---|---|
| **ota-ona** | o'quvchining logini | baholar, statistika, bildirishnoma |
| **xodim** | xodimning o'z logini | davomat, topshiriq, darslar, oylik |

Turni `TgUser.linkKind` (`"student"` / `"staff"`) hal qiladi, bog'langan odam
esa `TgUser.userId` da. Yorug'lik nuqtasi — `getTgUser()`: u `kind`, `person`
(ikki turda ham) va `student` (faqat ota-ona oqimida obyekt) qaytaradi.

### Buzilmasligi kerak bo'lgan qoidalar

- **`TgUser.student` xodimda `NULL`.** O'quvchiga xabar yuboradigan serverdagi
  oqimlar (`penalty`, `debtReminder`, `premiumNotification`) shu ustun bo'yicha
  qidiradi — NULL tufayli ular xodim qatoriga hech qachon urilmaydi. Yangi
  "o'quvchiga yubor" kodi ham `student` bo'yicha qidirishi kerak, `userId`
  bo'yicha emas.
- **Rol muhrlanmaydi.** `linkKind` — TUR, rol emas. Menyu uchun rol har safar
  `User.role` dan jonli o'qiladi: odamning roli o'zgarsa (o'qituvchi →
  ma'muriyat) muhrlangan qiymat jimgina eskirib, noto'g'ri menyu ko'rsatardi.
- **Tugma matnlari ikki menyuda takrorlanmaydi.** Telegram'da "tugma" — oddiy
  matnli xabar; bir xil satr bo'lsa xodimga ota-ona oqimi ochilib ketardi.
- **Har handler turni qayta tekshiradi** (`requireStaff` / `requireStudent`).
  Klaviatura MIJOZDA qoladi: rol almashgandan keyin ham eski tugma bosiladi.
- **Xodim hodisalari `bot.staff.` prefiksi bilan** yoziladi
  (`bot.handler.js#STAFF_ACTION`). Serverdagi
  `activityDashboard.service.js#STAFF_PREFIX` ayni shu satr va **ikkalasi
  birga o'zgaradi**: panelda "bot" kanali OTA-ONA QAMROVINI bildiradi
  (`botRate` maxraji — o'quvchiga bog'langan hisoblar), xodim hodisasi shu
  prefiks bo'yicha sanoqdan chiqariladi. Prefiks mos kelmasa ulush jimgina
  100% dan oshib ketardi.
- **`staff.service.js` faqat O'QIYDI.** Davomat belgilash, topshiriq yakunlash,
  oylik hisoblash qoidalari serverda — botda takrorlanmaydi. Botdan amal
  bajarish kerak bo'lsa, server endpoint'i orqali.
- **Xodimga faqat O'ZINING ma'lumoti.** Har so'rov `userId` bo'yicha
  cheklangan, shuning uchun botda ruxsat tekshiruvi yo'q. Yig'ma ko'rsatkich
  (boshqa odam, filial kesimi) botga CHIQMAYDI: u bo'lim darajasidagi ruxsatga
  bog'liq (`server/src/utils/permissions.js`) va uni botda ikkinchi marta
  amalga oshirish ruxsat tizimini ikkiga bo'lardi.
- **Bitta Telegram = bitta bog'lanish.** Farzandi shu maktabda o'qiydigan xodim
  ikki rolda bir vaqtda tura olmaydi — login almashtiradi va bot buni aytadi
  (`SWITCHED_TO_*`).

## Sums

Summa matni — `message.service.js` dagi `formatSum`: "6 741 000 so'm".
Serverdagi `money.helpers#formatSum` ning ko'zgusi (bot va panel bitta oylikni
boshqa-boshqa ko'rsatmasligi kerak). `toLocaleString` TAQIQLANGAN — ajratgich
Node ICU qurilishiga bog'liq bo'lib qolardi.

## Dates

Botdan chiqadigan sana ham panellardagi bilan BIR XIL bo'lishi shart —
ota-ona Telegramda "21.05.2025", panelda "21-may, 2025" ko'rmasligi kerak.

- `src/services/message.service.js` dagi `formatDate` — yagona formatlovchi.
  Yangi joyda sana kerak bo'lsa o'shani import qiling, ikkinchisini yozmang.
  Yonidagilar: `formatTime` ("14:30", Toshkent devor-soati) va `formatMonth`
  (202601 → "Yanvar, 2026").
- `toLocaleDateString()` va qo'lda yig'ilgan `${day}.${month}.${year}`
  shablonlari TAQIQLANGAN.
- **`formatDate(v, { utc: true })` — UTC yarim tunida saqlangan KUN uchun**
  (`attendances.date`, `grades.date`). Bayroqsiz chaqirilsa bot UTC'dan
  orqadagi zonada ishlaganda sana bir kunga siljiydi. Instantlar
  (`createdAt`, `dueDate`) uchun bayroq qo'yilmaydi — serverdagi
  `formatDateUz` bilan ayni qoida.

Batafsil: `.claude/rules/dates.md`.
