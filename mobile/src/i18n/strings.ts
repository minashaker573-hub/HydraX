/**
 * HYDRAX Mobile — bilingual strings (English / Arabic).
 *
 * A flat dot-keyed table rather than a compiled catalogue or an i18n library:
 * the app has one screen's worth of copy per tab, and a lookup table is both
 * smaller than a dependency and directly testable — see
 * __tests__/i18n.test.ts, which fails if any key is missing a language.
 *
 * NOT translated, deliberately: device ids, firmware version strings, RSSI,
 * Wi-Fi, ESP32, and the controller's own state/event/alert enum tokens where
 * they are shown as raw protocol vocabulary. Those are hardware identifiers,
 * not prose — the same rule the dashboard follows (dashboard/js/i18n.js).
 * Where an enum needs a human sentence it gets one under `state.*`, `event.*`
 * or `alert.*`, and the raw token stays visible beside it.
 */

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface Entry {
  readonly en: string;
  readonly ar: string;
}

export const STRINGS = {
  /* ---------------------------------------------------------------- common */
  'common.appName': { en: 'HYDRAX', ar: 'HYDRAX' },
  'common.tagline': {
    en: 'Intelligent Irrigation & Monitoring',
    ar: 'نظام الري الذكي والمراقبة',
  },
  'common.loading': { en: 'Loading…', ar: 'جارٍ التحميل…' },
  'common.retry': { en: 'Try again', ar: 'إعادة المحاولة' },
  'common.refresh': { en: 'Refresh', ar: 'تحديث' },
  'common.notAvailable': { en: 'NOT AVAILABLE', ar: 'غير متاح' },
  'common.none': { en: 'None', ar: 'لا شيء' },
  'common.unknown': { en: 'Unknown', ar: 'غير معروف' },
  'common.zone': { en: 'Zone {n}', ar: 'المنطقة {n}' },
  'common.zoneShort': { en: 'ZONE {n}', ar: 'المنطقة {n}' },
  'common.language': { en: 'Language', ar: 'اللغة' },
  'common.viewDetails': { en: 'View details', ar: 'عرض التفاصيل' },
  'common.back': { en: 'Back', ar: 'رجوع' },
  'common.justNow': { en: 'just now', ar: 'الآن' },
  'common.secondsAgo': { en: '{n}s ago', ar: 'قبل {n} ث' },
  'common.minutesAgo': { en: '{n}m ago', ar: 'قبل {n} د' },
  'common.hoursAgo': { en: '{n}h ago', ar: 'قبل {n} س' },
  'common.daysAgo': { en: '{n}d ago', ar: 'قبل {n} ي' },
  'common.durationSeconds': { en: '{s}s', ar: '{s} ث' },
  'common.durationMinutes': { en: '{m}m {s}s', ar: '{m} د {s} ث' },
  'common.durationHours': { en: '{h}h {m}m', ar: '{h} س {m} د' },
  'common.lastUpdated': { en: 'Last updated {when}', ar: 'آخر تحديث {when}' },
  'common.seeAll': { en: 'See all', ar: 'عرض الكل' },

  /* ------------------------------------------------------------- provenance */
  'source.simulation': { en: 'SIMULATION', ar: 'محاكاة' },
  'source.simulationBody': {
    en: 'This controller is a software simulation. Every reading below is synthetic — no soil probe, pump or valve exists behind it yet.',
    ar: 'وحدة التحكم هذه محاكاة برمجية. كل قراءة هنا مُولَّدة — لا يوجد مجس تربة أو مضخة أو صمام فعلي خلفها بعد.',
  },
  'source.field': { en: 'FIELD HARDWARE', ar: 'جهاز ميداني' },
  'source.monitorOnly': {
    en: 'Irrigation decisions are made on the controller. This app monitors — it is never in the control path.',
    ar: 'قرارات الري تُتخذ على وحدة التحكم نفسها. هذا التطبيق للمراقبة فقط — وهو ليس جزءًا من مسار التحكم أبدًا.',
  },

  /* ------------------------------------------------------------------- nav */
  'nav.home': { en: 'Home', ar: 'الرئيسية' },
  'nav.zones': { en: 'Zones', ar: 'المناطق' },
  'nav.history': { en: 'History', ar: 'السجل' },
  'nav.alerts': { en: 'Alerts', ar: 'التنبيهات' },
  'nav.device': { en: 'Device', ar: 'الجهاز' },

  /* ------------------------------------------------------------------ home */
  'home.goodMorning': { en: 'Good morning', ar: 'صباح الخير' },
  'home.goodAfternoon': { en: 'Good afternoon', ar: 'طاب يومك' },
  'home.goodEvening': { en: 'Good evening', ar: 'مساء الخير' },
  'home.systemStatus': { en: 'SYSTEM STATUS', ar: 'حالة النظام' },
  'home.online': { en: 'ONLINE', ar: 'متصل' },
  'home.offline': { en: 'OFFLINE', ar: 'غير متصل' },
  'home.overallMoisture': { en: 'Overall soil moisture', ar: 'متوسط رطوبة التربة' },
  'home.acrossZones': { en: 'across {n} zones', ar: 'عبر {n} مناطق' },
  'home.pump': { en: 'Pump', ar: 'المضخة' },
  'home.activeZone': { en: 'Active zone', ar: 'المنطقة النشطة' },
  'home.on': { en: 'ON', ar: 'يعمل' },
  'home.off': { en: 'OFF', ar: 'متوقف' },
  'home.controlLoop': { en: 'LIVE CONTROL LOOP', ar: 'حلقة التحكم الحية' },
  'home.controlLoopCaption': {
    en: 'What the controller has sensed, concluded and done, right now.',
    ar: 'ما استشعرته وحدة التحكم واستنتجته ونفذته، الآن.',
  },
  'home.farmZones': { en: 'FARM ZONES', ar: 'مناطق المزرعة' },
  'home.recentEvents': { en: 'RECENT EVENTS', ar: 'الأحداث الأخيرة' },
  'home.noEvents': { en: 'No events reported yet', ar: 'لم تسجل أي أحداث بعد' },
  'home.activeAlerts': { en: '{n} active alerts', ar: '{n} تنبيهات نشطة' },
  'home.activeAlert': { en: '1 active alert', ar: 'تنبيه نشط واحد' },
  'home.activeAlertsCount': { en: '{n} active alerts', ar: '{n} تنبيهات نشطة' },
  'home.noActiveAlerts': { en: 'No active alerts', ar: 'لا توجد تنبيهات نشطة' },
  'home.allClearBody': { en: 'Nothing needs attention right now', ar: 'لا شيء يحتاج انتباهك الآن' },
  'home.reviewAlerts': { en: 'Tap to review', ar: 'اضغط للمراجعة' },
  'home.soilOverview': { en: 'SOIL OVERVIEW', ar: 'نظرة عامة على التربة' },
  'home.irrigationStatus': { en: 'IRRIGATION STATUS', ar: 'حالة الري' },
  'home.zoneSnapshot': { en: 'ZONE SNAPSHOT', ar: 'لمحة عن المناطق' },
  'home.recentActivity': { en: 'RECENT ACTIVITY', ar: 'النشاط الأخير' },
  'home.valvesOpen': { en: '{open}/{total} open', ar: '{open}/{total} مفتوح' },

  /* --------------------------------------------------------- control loop */
  'loop.sense': { en: 'SENSE', ar: 'الاستشعار' },
  'loop.understand': { en: 'UNDERSTAND', ar: 'التحليل' },
  'loop.decide': { en: 'DECIDE', ar: 'القرار' },
  'loop.act': { en: 'ACT', ar: 'التنفيذ' },
  'loop.monitor': { en: 'MONITOR', ar: 'المراقبة' },
  'loop.probesValid': { en: '{valid} of {total} probes valid', ar: '{valid} من {total} مجسات صالحة' },
  'loop.driest': { en: 'Driest zone', ar: 'أكثر منطقة جفافا' },
  'loop.running': { en: 'RUNNING', ar: 'يعمل' },
  'loop.holding': { en: 'HOLDING', ar: 'متوقف' },
  'loop.valveOpen': { en: 'valve open', ar: 'الصمام مفتوح' },
  'loop.valveClosed': { en: 'all valves closed', ar: 'جميع الصمامات مغلقة' },
  'loop.noReadings': { en: 'no valid readings', ar: 'لا توجد قراءات صالحة' },
  'loop.awaitingTelemetry': { en: 'awaiting telemetry', ar: 'بانتظار البيانات' },

  /* ----------------------------------------------------------------- zones */
  'zones.title': { en: 'Zones', ar: 'المناطق' },
  'zones.subtitle': { en: 'Every configured irrigation zone', ar: 'كل منطقة ري معدة' },
  'zones.soilMoisture': { en: 'Soil moisture', ar: 'رطوبة التربة' },
  'zones.threshold': { en: 'Threshold', ar: 'حد التشغيل' },
  'zones.valve': { en: 'Valve', ar: 'الصمام' },
  'zones.irrigation': { en: 'Irrigation', ar: 'الري' },
  'zones.open': { en: 'OPEN', ar: 'مفتوح' },
  'zones.closed': { en: 'CLOSED', ar: 'مغلق' },
  'zones.irrigating': { en: 'IRRIGATING', ar: 'يسقي' },
  'zones.idle': { en: 'IDLE', ar: 'خامل' },
  'zones.none': { en: 'No zones reported', ar: 'لا توجد مناطق' },
  'zones.noneBody': {
    en: 'The controller has not reported any irrigation zones yet.',
    ar: 'لم تبلغ وحدة التحكم عن أي مناطق ري بعد.',
  },
  'zones.thresholdMissing': { en: 'NO BAND SET', ar: 'لم يضبط نطاق' },
  'zones.thresholdNote': {
    en: 'The controller runs on thresholds compiled into its firmware. The backend holds no advisory copy for this zone, so none is shown.',
    ar: 'تعمل وحدة التحكم بحدود مبرمجة داخل نظامها. لا توجد نسخة إرشادية في الخادم لهذه المنطقة، لذلك لا يعرض شيء.',
  },
  'zones.thresholdAdvisory': {
    en: 'Advisory only — Phase 1 firmware runs on its compiled-in thresholds and does not read these values.',
    ar: 'إرشادي فقط — تعمل وحدة التحكم في المرحلة الأولى بحدودها المبرمجة ولا تقرأ هذه القيم.',
  },
  'zones.startStop': { en: 'start {start}% · stop {stop}%', ar: 'تشغيل {start}% · إيقاف {stop}%' },
  'zones.thresholdSection': { en: 'THRESHOLDS', ar: 'حدود التشغيل' },
  'zones.configured': { en: 'ZONES CONFIGURED', ar: 'المناطق المعدة' },
  'zones.irrigatingNow': { en: 'IRRIGATING NOW', ar: 'يُروى الآن' },

  /* ----------------------------------------------------------- zone detail */
  'zone.sensors': { en: 'SOIL PROBES', ar: 'مجسات التربة' },
  'zone.sensor1': { en: 'Probe 1', ar: 'المجس 1' },
  'zone.sensor2': { en: 'Probe 2', ar: 'المجس 2' },
  'zone.average': { en: 'Zone average', ar: 'متوسط المنطقة' },
  'zone.valid': { en: 'VALID', ar: 'صالح' },
  'zone.invalid': { en: 'INVALID', ar: 'غير صالح' },
  'zone.coverage': { en: 'Probe coverage', ar: 'تغطية المجسات' },
  'zone.state': { en: 'ZONE STATE', ar: 'حالة المنطقة' },
  'zone.runtime': { en: 'Current run', ar: 'مدة التشغيل الحالية' },
  'zone.noRun': { en: 'No active run', ar: 'لا يوجد تشغيل حالي' },
  'zone.notFound': { en: 'Zone not found', ar: 'المنطقة غير موجودة' },
  'zone.notFoundBody': {
    en: 'The controller is no longer reporting this zone.',
    ar: 'لم تعد وحدة التحكم تبلغ عن هذه المنطقة.',
  },
  'zone.extensible': {
    en: 'Phase 1 hardware reports two soil probes and a valve per zone. Flow, pressure and pump sensors are not fitted, so nothing is shown for them.',
    ar: 'أجهزة المرحلة الأولى تبلغ عن مجسي تربة وصمام لكل منطقة. لا توجد مستشعرات تدفق أو ضغط أو مضخة، لذلك لا يعرض شيء عنها.',
  },

  /* --------------------------------------------------------------- history */
  'history.title': { en: 'History', ar: 'السجل' },
  'history.subtitle': { en: 'Recorded telemetry and events', ar: 'البيانات والأحداث المسجلة' },
  'history.moistureTrend': { en: 'SOIL MOISTURE', ar: 'رطوبة التربة' },
  'history.samples': { en: '{n} samples', ar: '{n} عينة' },
  'history.span': { en: 'over {span}', ar: 'خلال {span}' },
  'history.events': { en: 'IRRIGATION EVENTS', ar: 'أحداث الري' },
  'history.runtime': { en: 'PUMP RUNTIME', ar: 'زمن تشغيل المضخة' },
  'history.runtimeBody': {
    en: 'Summed from the durations the controller reported on completed irrigation runs.',
    ar: 'محسوب من المدد التي أبلغت عنها وحدة التحكم في دورات الري المكتملة.',
  },
  'history.runs': { en: '{n} recorded runs', ar: '{n} دورة مسجلة' },
  'history.runtimeMissing': { en: 'NOT REPORTED', ar: 'غير مُبلَّغ' },
  'history.runtimeMissingBody': {
    en: 'The controller recorded {n} irrigation runs but did not report a duration for any of them, so no total can be shown. The simulated device leaves this field at zero; real firmware fills it in.',
    ar: 'سجلت وحدة التحكم {n} دورة ري دون الإبلاغ عن مدة أي منها، لذلك لا يمكن عرض إجمالي. الجهاز المحاكى يترك هذا الحقل صفرا، أما البرنامج الحقيقي فيملؤه.',
  },
  'history.empty': { en: 'No history yet', ar: 'لا يوجد سجل بعد' },
  'history.emptyBody': {
    en: 'Once the controller reports telemetry it will be charted here.',
    ar: 'بمجرد أن ترسل وحدة التحكم بياناتها ستظهر هنا.',
  },
  'history.notMeasured': { en: 'NOT MEASURED', ar: 'غير مقاس' },
  'history.noFlowSensor': {
    en: 'Water volume and flow rate are not shown because no flow meter is fitted. Inferring litres from pump runtime would be a fabrication — a blocked line and a burst pipe both run the pump while moving very different volumes.',
    ar: 'لا يعرض حجم المياه أو معدل التدفق لعدم وجود عداد تدفق. استنتاج الكميات من زمن تشغيل المضخة سيكون تلفيقا — فالخط المسدود والأنبوب المكسور كلاهما يشغل المضخة بكميات مختلفة تماما.',
  },

  /* ---------------------------------------------------------------- alerts */
  'alerts.title': { en: 'Alerts', ar: 'التنبيهات' },
  'alerts.subtitle': {
    en: 'Raised by the backend from device reports',
    ar: 'صادرة من الخادم بناء على تقارير الجهاز',
  },
  'alerts.filterActive': { en: 'Active', ar: 'النشطة' },
  'alerts.filterAll': { en: 'All', ar: 'الكل' },
  'alerts.none': { en: 'No active alerts', ar: 'لا توجد تنبيهات نشطة' },
  'alerts.noneBody': {
    en: 'Nothing is wrong right now. Alerts appear here the moment the controller reports a fault or goes quiet.',
    ar: 'لا يوجد أي خلل حاليا. ستظهر التنبيهات هنا فور إبلاغ وحدة التحكم عن عطل أو انقطاعها.',
  },
  'alerts.noneAtAll': { en: 'No alerts recorded', ar: 'لا توجد تنبيهات مسجلة' },
  'alerts.raised': { en: 'Raised {when}', ar: 'صدر {when}' },
  'alerts.resolvedAt': { en: 'Resolved {when}', ar: 'انتهى {when}' },
  'alerts.active': { en: 'ACTIVE', ar: 'نشط' },
  'alerts.resolved': { en: 'RESOLVED', ar: 'منتهٍ' },
  'alerts.critical': { en: 'CRITICAL', ar: 'حرج' },
  'alerts.warning': { en: 'WARNING', ar: 'تحذير' },
  'alerts.resolveNote': {
    en: 'Resolving an alert is an operator action and requires the operator console. This app is read-only.',
    ar: 'إغلاق التنبيه إجراء تشغيلي يتم من لوحة المشغل. هذا التطبيق للقراءة فقط.',
  },

  /* ---------------------------------------------------------------- device */
  'device.title': { en: 'Device', ar: 'الجهاز' },
  'device.subtitle': { en: 'Controller identity and link health', ar: 'هوية وحدة التحكم وحالة الاتصال' },
  'device.identity': { en: 'IDENTITY', ar: 'الهوية' },
  'device.link': { en: 'LINK', ar: 'الاتصال' },
  'device.controlPipeline': { en: 'CONTROLLER PIPELINE', ar: 'مسار وحدة التحكم' },
  'device.controlPipelineCaption': {
    en: 'What the controller has sensed, concluded and done, right now.',
    ar: 'ما استشعرته وحدة التحكم واستنتجته ونفذته، الآن.',
  },
  'device.provenance': { en: 'DATA SOURCE', ar: 'مصدر البيانات' },
  'device.deviceId': { en: 'Device ID', ar: 'معرف الجهاز' },
  'device.firmware': { en: 'Firmware', ar: 'إصدار البرنامج' },
  'device.status': { en: 'Status', ar: 'الحالة' },
  'device.controllerStatus': { en: 'Controller status', ar: 'حالة وحدة التحكم' },
  'device.lastSeen': { en: 'Last seen', ar: 'آخر اتصال' },
  'device.firstSeen': { en: 'First seen', ar: 'أول اتصال' },
  'device.rssi': { en: 'Wi-Fi RSSI', ar: 'قوة إشارة Wi-Fi' },
  'device.wifi': { en: 'Wi-Fi link', ar: 'اتصال Wi-Fi' },
  'device.connected': { en: 'CONNECTED', ar: 'متصل' },
  'device.disconnected': { en: 'DISCONNECTED', ar: 'غير متصل' },
  'device.uptime': { en: 'Reported uptime', ar: 'مدة التشغيل المبلغة' },
  'device.samples': { en: 'Telemetry samples stored', ar: 'عينات مخزنة' },
  'device.none': { en: 'No controller registered', ar: 'لا توجد وحدة تحكم مسجلة' },
  'device.noneBody': {
    en: 'The backend has never received telemetry from a HYDRAX controller. Start the simulated device, or connect real hardware.',
    ar: 'لم يستقبل الخادم أي بيانات من وحدة تحكم HYDRAX. شغل الجهاز المحاكى أو وصل جهازا فعليا.',
  },
  'device.rssiScale': { en: 'dBm — closer to zero is stronger', ar: 'ديسيبل — كلما اقترب من الصفر كان أقوى' },
  'device.backend': { en: 'Backend', ar: 'الخادم' },
  'device.notFoundTitle': { en: 'Screen not found', ar: 'الشاشة غير موجودة' },
  'device.notFoundBody': {
    en: 'That link does not lead anywhere in this app.',
    ar: 'هذا الرابط لا يؤدي إلى أي شاشة في التطبيق.',
  },

  /* ---------------------------------------------------------------- errors */
  'error.title': { en: 'Cannot reach HYDRAX', ar: 'تعذر الوصول إلى HYDRAX' },
  'error.network': {
    en: 'The backend did not answer. Check that the phone and the server are on the same network.',
    ar: 'لم يستجب الخادم. تأكد من أن الهاتف والخادم على نفس الشبكة.',
  },
  'error.timeout': {
    en: 'The backend took too long to answer.',
    ar: 'استغرق الخادم وقتا طويلا للاستجابة.',
  },
  'error.server': {
    en: 'The backend reported an error. Nothing was changed.',
    ar: 'أبلغ الخادم عن خطأ. لم يتغير شيء.',
  },
  'error.unauthorized': {
    en: 'The backend refused this request. This app is read-only and sends no credentials.',
    ar: 'رفض الخادم هذا الطلب. هذا التطبيق للقراءة فقط ولا يرسل أي بيانات اعتماد.',
  },
  'error.parse': {
    en: 'The backend answered with data this app could not read.',
    ar: 'رد الخادم ببيانات لم يتمكن التطبيق من قراءتها.',
  },
  'error.serverUrl': { en: 'Server: {url}', ar: 'الخادم: {url}' },
  'error.stale': {
    en: 'Showing the last data received. The controller keeps irrigating on its own.',
    ar: 'تعرض آخر بيانات مستلمة. تواصل وحدة التحكم الري بشكل مستقل.',
  },
  'error.offlineBadge': { en: 'NO CONNECTION', ar: 'لا يوجد اتصال' },

  /* --------------------------------------------- controller state sentences */
  'state.IDLE': { en: 'Idle', ar: 'خامل' },
  'state.CHECKING_SOIL': { en: 'Checking soil', ar: 'يفحص التربة' },
  'state.IRRIGATION_REQUIRED': { en: 'Irrigation required', ar: 'الري مطلوب' },
  'state.STARTING': { en: 'Starting', ar: 'يبدأ التشغيل' },
  'state.IRRIGATING': { en: 'Irrigating', ar: 'يسقي' },
  'state.STOPPING': { en: 'Stopping', ar: 'يتوقف' },
  'state.SENSOR_ERROR': { en: 'Sensor error', ar: 'عطل في المستشعر' },
  'state.ACTUATOR_ERROR': { en: 'Actuator error', ar: 'عطل في المشغل' },
  'state.TIMEOUT': { en: 'Runtime timeout', ar: 'انتهت المهلة' },

  'status.OK': { en: 'OK', ar: 'سليم' },
  'status.DEGRADED': { en: 'Degraded', ar: 'أداء منخفض' },
  'status.SENSOR_ERROR': { en: 'Sensor error', ar: 'عطل في المستشعر' },
  'status.ACTUATOR_ERROR': { en: 'Actuator error', ar: 'عطل في المشغل' },

  'event.CONTROLLER_STARTED': { en: 'Controller started', ar: 'بدأ تشغيل وحدة التحكم' },
  'event.ZONE_ACTIVATED': { en: 'Zone activated', ar: 'تم تفعيل المنطقة' },
  'event.IRRIGATION_STARTED': { en: 'Irrigation started', ar: 'بدأ الري' },
  'event.IRRIGATION_STOPPED': { en: 'Irrigation stopped', ar: 'توقف الري' },
  'event.IRRIGATION_TIMEOUT': { en: 'Irrigation timed out', ar: 'انتهت مهلة الري' },
  'event.SENSOR_ERROR': { en: 'Sensor fault', ar: 'عطل في المستشعر' },
  'event.SENSOR_RECOVERED': { en: 'Sensor recovered', ar: 'تعافى المستشعر' },
  'event.ACTUATOR_ERROR': { en: 'Actuator fault', ar: 'عطل في المشغل' },
  'event.FAULT_CLEARED': { en: 'Fault cleared', ar: 'تم مسح العطل' },
  'event.SAFE_SHUTDOWN': { en: 'Safe shutdown', ar: 'إيقاف آمن' },

  'alert.SENSOR_ERROR': { en: 'Sensor error', ar: 'عطل في المستشعر' },
  'alert.IRRIGATION_TIMEOUT': { en: 'Irrigation timeout', ar: 'انتهاء مهلة الري' },
  'alert.ACTUATOR_ERROR': { en: 'Actuator error', ar: 'عطل في المشغل' },
  'alert.DEVICE_OFFLINE': { en: 'Controller offline', ar: 'وحدة التحكم غير متصلة' },

  'coverage.full': { en: 'Both probes valid', ar: 'كلا المجسين صالح' },
  'coverage.degraded': { en: 'One probe valid', ar: 'مجس واحد صالح' },
  'coverage.none': { en: 'No valid probe', ar: 'لا يوجد مجس صالح' },

  'moisture.dry': { en: 'DRY', ar: 'جافة' },
  'moisture.normal': { en: 'NORMAL', ar: 'طبيعية' },
  'moisture.wet': { en: 'WET', ar: 'مروية' },
  'moisture.noBand': { en: 'NO BAND', ar: 'بلا نطاق' },
} as const satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;
