import type { StatusMessages } from '../part-texts.js';

/** العربية، نصوص شريط الحالة (`@dzgrid/dom/statusbar`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_STATUS.text }`. `{v}`: الرقم. */
export const AR_STATUS = {
  locale: 'ar',
  text: {
    'status.label': "شريط الحالة، {grid}",
    'status.rows': "الصفوف: {v}",
    'status.filtered': "المصفّاة: {v}",
    'status.selected': "المحدّدة: {v}",
    'status.all': "المحدّدة: الكل",
    'status.count': "العدد: {v}",
    'status.sum': "المجموع: {v}",
    'status.avg': "المتوسط: {v}",
    'status.min': "الأدنى: {v}",
    'status.max': "الأقصى: {v}",
    'status.partial': "(جزئي)",
    'status.read': "قراءة المجاميع",
    'status.none': "لا مجاميع",
    'status.sep': "، ",
  },
} satisfies StatusMessages;
