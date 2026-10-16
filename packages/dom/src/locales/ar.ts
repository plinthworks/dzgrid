import type { GridMessages } from '../messages.js';

/** العربية. Plural forms in all six categories; one and two keep the number in brackets for screen readers. To be read by an Arabic reader before Phase 2 closes. */
export const AR = {
  locale: 'ar',
  text: {
    'grid.label': "جدول البيانات",
    'grid.noRows': "لا توجد صفوف",
    'grid.noMatches': "لا توجد صفوف مطابقة للمرشحات",
    'grid.loading': "جار التحميل\u2026",
    'grid.error': "تعذر تحميل البيانات",
    'sort.ascending': "ترتيب تصاعدي",
    'sort.descending': "ترتيب تنازلي",
    'sort.none': "غير مرتب",
    'sort.priority': "الترتيب {n}",
    'announce.sorted': "مرتب حسب {column}، {direction}",
    'announce.sortCleared': "تمت إزالة الترتيب",
    'announce.rows': { zero: "{n} صف", one: "صف واحد ({n})", two: "صفان ({n})", few: "{n} صفوف", many: "{n} صفا", other: "{n} صف" },
    'announce.selected': { zero: "{n} صف محدد", one: "تم تحديد صف واحد ({n})", two: "تم تحديد صفين ({n})", few: "تم تحديد {n} صفوف", many: "تم تحديد {n} صفا", other: "تم تحديد {n} صف" },
    'announce.rangeCancelled': "تم إلغاء النطاق: لم يعد صفه الأول معروضا",
    'announce.loading': "جار التحميل",
    'announce.error': "فشل التحميل",
    'selection.row': "تحديد الصف",
    'selection.all': "تحديد كل الصفوف",
    'selection.column': "التحديد",
    'resize.handle': "تغيير عرض {column}",
    'pinned.start': "مثبت في البداية",
    'pinned.end': "مثبت في النهاية",
    'header.sortHint': "اضغط Enter للترتيب، وShift+Enter للإضافة إلى الترتيب",
  },
} satisfies GridMessages;
