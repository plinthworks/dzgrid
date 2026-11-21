import type { AdvancedFilterMessages } from '../part-texts.js';

/** العربية، نصوص المرشح المتقدم (`@dzgrid/dom/advanced-filter`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_ADVANCED_FILTER.text }`. `{n}`: عدد. */
export const AR_ADVANCED_FILTER = {
  locale: 'ar',
  text: {
    'adv.title': "مرشح متقدم",
    'adv.join': "الإبقاء على الصفوف التي تحقق",
    'adv.and': "الكل (و)",
    'adv.or': "واحد على الأقل (أو)",
    'adv.groupAnd': "مجموعة: الكل (و)",
    'adv.groupOr': "مجموعة: واحد على الأقل (أو)",
    'adv.addCondition': "+ شرط",
    'adv.addGroup': "+ مجموعة",
    'adv.removeCondition': "حذف الشرط",
    'adv.removeGroup': "حذف المجموعة",
    'adv.column': "العمود",
    'adv.pick': "اختر عمودًا",
    'adv.condition': "الشرط {n}",
    'adv.apply': "تطبيق",
    'adv.clear': "مسح",
    'adv.cancel': "إلغاء",
    'adv.conditionAdded': "أُضيف شرط",
    'adv.groupAdded': "أُضيفت مجموعة",
    'adv.removed': "حُذف",
  },
} satisfies AdvancedFilterMessages;
