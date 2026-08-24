# Claude Code - Bot Module Rules

> Global rules in root CLAUDE.md also apply.

## Structure

- Follow the existing structure in this module.
- Do not introduce new patterns unless the codebase already uses them.

## Dates

Botdan chiqadigan sana ham panellardagi bilan BIR XIL bo'lishi shart —
ota-ona Telegramda "21.05.2025", panelda "21-may, 2025" ko'rmasligi kerak.

- `src/services/message.service.js` dagi `formatDate` — yagona formatlovchi.
  Yangi joyda sana kerak bo'lsa o'shani import qiling, ikkinchisini yozmang.
- `toLocaleDateString()` va qo'lda yig'ilgan `${day}.${month}.${year}`
  shablonlari TAQIQLANGAN.

Batafsil: `.claude/rules/dates.md`.
