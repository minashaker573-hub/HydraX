/**
 * HYDRAX dashboard — bilingual strings (English / Arabic) and RTL switching.
 *
 * The dashboard has no build step, so this is a plain lookup table, not a
 * compiled catalogue. `t(key, vars)` looks a dot-path up in the active
 * language, falls back to English, and falls back to the key itself rather
 * than throwing — a missing translation should be visible and ugly, not a
 * crash on a live monitoring screen.
 *
 * Technical identifiers that are not language (ESP32, RSSI, Wi-Fi, device
 * ids, firmware version strings, HYX- references) are never translated or
 * mirrored — see docs/WEBSITE.md and CLAUDE conventions for why: they are
 * protocol/hardware vocabulary, not prose.
 */

const STORAGE_KEY = 'hydrax-dashboard-lang';
const DEFAULT_LANG = 'en';
const SUPPORTED = ['en', 'ar'];

const listeners = new Set();

/* ========================================================================= */
/* dictionary                                                                */
/* ========================================================================= */

const STRINGS = {
  common: {
    notAvailable: { en: 'NOT AVAILABLE', ar: 'غير متاح' },
    noDataAvailable: { en: 'No data available', ar: 'لا توجد بيانات متاحة' },
    unknown: { en: 'unknown', ar: 'غير معروف' },
    justNow: { en: 'just now', ar: 'الآن' },
    secondsAgo: { en: '{n}s ago', ar: 'منذ {n} ث' },
    minutesAgo: { en: '{n}m ago', ar: 'منذ {n} د' },
    hoursAgo: { en: '{n}h ago', ar: 'منذ {n} س' },
    daysAgo: { en: '{n}d ago', ar: 'منذ {n} ي' },
    durationHoursMinutes: { en: '{h}h {m}m', ar: '{h}س {m}د' },
    durationMinutesSeconds: { en: '{m}m {s}s', ar: '{m}د {s}ث' },
    durationSeconds: { en: '{s}s', ar: '{s}ث' },
    durationZero: { en: '0s', ar: '0ث' },
    zonesConfigured: { en: 'zones configured', ar: 'مناطق مُعدّة' },
    zone: { en: 'Zone {n}', ar: 'المنطقة {n}' },
    viewDetails: { en: 'View details', ar: 'عرض التفاصيل' },
    close: { en: 'Close', ar: 'إغلاق' },
    menu: { en: 'Menu', ar: 'القائمة' },
    notifications: { en: 'Notifications', ar: 'التنبيهات' },
    language: { en: 'Language', ar: 'اللغة' },
  },

  brand: {
    name: { en: 'HYDRAX', ar: 'Hydrax' },
    tagline: { en: 'Intelligent Irrigation & Monitoring System', ar: 'نظام الري الذكي والمراقبة المتكاملة' },
  },

  nav: {
    overview: { en: 'Overview', ar: 'الرئيسية' },
    irrigation: { en: 'Smart Irrigation', ar: 'المناطق' },
    pump: { en: 'Pump Health', ar: 'حالة المضخة' },
    water: { en: 'Water Network', ar: 'شبكة المياه' },
    safety: { en: 'Safety Center', ar: 'الأمان' },
    alerts: { en: 'Alerts & Events', ar: 'التنبيهات' },
    device: { en: 'Device', ar: 'الجهاز' },
  },

  sidebar: {
    deviceStatus: { en: 'DEVICE STATUS', ar: 'حالة الجهاز' },
    connected: { en: 'Connected', ar: 'متصل' },
    disconnected: { en: 'Disconnected', ar: 'غير متصل' },
    lastContact: { en: 'Last contact', ar: 'آخر اتصال' },
    monitorOnly: {
      en: 'Irrigation decisions are made on the controller. This dashboard monitors — it is never in the control path.',
      ar: 'قرارات الري تُتّخذ على وحدة التحكم نفسها. هذه اللوحة تراقب فقط — وهي ليست جزءًا من مسار التحكم أبدًا.',
    },
  },

  topbar: {
    allZones: { en: 'All zones', ar: 'جميع المناطق' },
    system: { en: 'System', ar: 'النظام' },
  },

  chrome: {
    demo: { en: 'DEMO / SIMULATION', ar: 'تجريبي / محاكاة' },
    live: { en: 'LIVE DATA', ar: 'بيانات مباشرة' },
    deviceOffline: { en: 'DEVICE OFFLINE', ar: 'الجهاز غير متصل' },
    backendUnreachable: { en: 'backend unreachable — controller unaffected', ar: 'تعذّر الوصول للخادم — وحدة التحكم غير متأثرة' },
    updatedAt: { en: 'updated {time}', ar: 'آخر تحديث {time}' },
  },

  banner: {
    backendUnreachableTitle: { en: 'Backend unreachable.', ar: 'تعذّر الوصول إلى الخادم.' },
    backendUnreachableBody: {
      en: '{reason}. The controller keeps irrigating locally — only this dashboard is affected.',
      ar: '{reason}. وحدة التحكم تواصل الري محليًا — هذه اللوحة فقط هي المتأثرة.',
    },
    lastKnownTitle: { en: 'Showing last known state.', ar: 'يتم عرض آخر حالة معروفة.' },
    lastKnownBody: {
      en: 'The backend stopped responding {time}. Values below may be out of date.',
      ar: 'توقّف الخادم عن الاستجابة {time}. القيم أدناه قد تكون غير محدّثة.',
    },
    demoTitle: { en: 'DEMO / SIMULATION.', ar: 'تجريبي / محاكاة.' },
    demoBody: {
      en: 'Telemetry on this page is synthetic, produced by the mock device fixture. It is not measured from soil.',
      ar: 'البيانات في هذه الصفحة اصطناعية، صادرة عن جهاز محاكاة. إنها ليست مقاسة من التربة فعليًا.',
    },
    deviceOfflineTitle: { en: 'Device offline.', ar: 'الجهاز غير متصل.' },
    deviceOfflineBody: {
      en: 'No telemetry since {time}. The controller continues irrigating on its own rules; these values are the last reported.',
      ar: 'لا توجد بيانات منذ {time}. تواصل وحدة التحكم الري وفق قواعدها الخاصة؛ هذه القيم هي آخر ما تم استلامه.',
    },
  },

  noDevice: {
    headline: { en: 'No device has reported yet', ar: 'لم يُبلّغ أي جهاز بعد' },
    detail: {
      en: 'Start the firmware, or run the mock device: npm run mock-device -- --key <your-key>',
      ar: 'شغّل البرنامج الثابت، أو شغّل جهاز المحاكاة: npm run mock-device -- --key <your-key>',
    },
  },

  overview: {
    welcome: { en: 'Welcome to HYDRAX', ar: 'مرحباً بك في Hydrax' },
    systemStatus: { en: 'System status', ar: 'حالة النظام' },
    system: { en: 'System', ar: 'النظام' },
    online: { en: 'ONLINE', ar: 'متصل' },
    offline: { en: 'OFFLINE', ar: 'غير متصل' },
    lastReport: { en: 'last report {time}', ar: 'آخر تقرير {time}' },
    soilMoisture: { en: 'Soil moisture', ar: 'رطوبة التربة' },
    farmAverageAcross: { en: 'farm average across {n} zones', ar: 'متوسط المزرعة عبر {n} مناطق' },
    noValidReadings: { en: 'no valid probe readings', ar: 'لا توجد قراءات صالحة من المجسات' },
    moistureSuitable: { en: 'suitable for irrigation range', ar: 'الرطوبة مناسبة للري' },
    temperature: { en: 'Temperature', ar: 'درجة الحرارة' },
    noTemperatureSensor: { en: 'no ambient temperature sensor on this device', ar: 'لا يوجد مستشعر حرارة محيطة على هذا الجهاز' },
    pump: { en: 'Pump', ar: 'المضخة' },
    running: { en: 'RUNNING', ar: 'تشغيل' },
    off: { en: 'OFF', ar: 'إيقاف' },
    currentRun: { en: 'current run {duration}', ar: 'التشغيل الحالي {duration}' },
    noActiveRun: { en: 'no active run', ar: 'لا يوجد تشغيل حالي' },
    irrigation: { en: 'Irrigation', ar: 'الري' },
    zoneActive: { en: 'zone {n} active', ar: 'المنطقة {n} نشطة' },
    noActiveZone: { en: 'no active zone', ar: 'لا توجد منطقة نشطة' },
    noTelemetryReceived: { en: 'no telemetry received', ar: 'لم يتم استلام بيانات' },
    waterFlow: { en: 'Water flow', ar: 'تدفق المياه' },
    noFlowSensor: { en: 'no flow sensor on this device', ar: 'لا يوجد مستشعر تدفق على هذا الجهاز' },
    whatHydraxIsDoing: { en: 'What HYDRAX is doing', ar: 'ما الذي يقوم به Hydrax الآن' },
    controlLoopLive: { en: 'the control loop, live', ar: 'حلقة التحكم، مباشرةً' },
    farmLayout: { en: 'Farm layout', ar: 'مخطط المزرعة' },
    farm: { en: 'Farm', ar: 'المزرعة' },
    activeAlerts: { en: 'Active alerts', ar: 'تنبيهات فورية' },
    noActiveAlerts: { en: 'No active alerts', ar: 'لا توجد تنبيهات حالية' },
    noFaultCondition: { en: 'The controller is not reporting any fault condition.', ar: 'لا يُبلّغ النظام عن أي حالة عطل.' },
    systemOperatingNormally: { en: 'System operating normally.', ar: 'النظام يعمل بشكل طبيعي.' },
    recentEvents: { en: 'Recent events', ar: 'سجل الأحداث' },
    newestFirst: { en: 'newest first', ar: 'الأحدث أولاً' },
    systemControl: { en: 'System control', ar: 'التحكم في النظام' },
    controlReadOnlyNote: {
      en: 'This dashboard is monitor-only by design — irrigation decisions are made on the controller, never commanded remotely, so there is no on/off switch here.',
      ar: 'هذه اللوحة للمراقبة فقط بحسب التصميم — قرارات الري تُتّخذ على وحدة التحكم نفسها، ولا يمكن التحكم فيها عن بُعد، لذا لا يوجد زر تشغيل/إيقاف هنا.',
    },
  },

  zoneCard: {
    active: { en: 'ACTIVE', ar: 'نشطة' },
    idle: { en: 'IDLE', ar: 'خامدة' },
    sensor1: { en: 'Sensor 1', ar: 'المستشعر 1' },
    sensor2: { en: 'Sensor 2', ar: 'المستشعر 2' },
    average: { en: 'Average', ar: 'المتوسط' },
    sensorCoverage: { en: 'Sensor coverage', ar: 'تغطية المستشعرات' },
    valve: { en: 'Valve', ar: 'حالة الصمام' },
    open: { en: 'OPEN', ar: 'مفتوح' },
    closed: { en: 'CLOSED', ar: 'مغلق' },
    currentRun: { en: 'Current run', ar: 'التشغيل الحالي' },
    lastIrrigation: { en: 'Last irrigation', ar: 'آخر ري' },
    lastDuration: { en: 'Last duration', ar: 'مدة آخر ري' },
    waterUsed: { en: 'Water used', ar: 'كمية المياه المستخدمة' },
    caption: {
      en: 'zone average · relative soil moisture (not volumetric water content)',
      ar: 'متوسط المنطقة · رطوبة تربة نسبية (وليست محتوى مائي حجمي)',
    },
  },

  irrigationPage: {
    noZonesHeadline: { en: 'No zones reported', ar: 'لم يتم الإبلاغ عن أي منطقة' },
    noZonesDetail: { en: 'The device has not sent zone telemetry yet.', ar: 'لم يُرسل الجهاز بيانات المناطق بعد.' },
    noBandTitle: { en: 'No threshold band recorded for this device.', ar: 'لا يوجد نطاق عتبة مسجَّل لهذا الجهاز.' },
    noBandBody: {
      en: 'The controller is still running on its own compiled-in thresholds — irrigation is unaffected. Set the advisory copy with PUT /api/v1/devices/{id}/config to classify zones as DRY / NORMAL / WET here.',
      ar: 'لا تزال وحدة التحكم تعمل وفق عتباتها المبرمجة الخاصة — الري غير متأثر. عيّن النسخة الاستشارية عبر PUT /api/v1/devices/{id}/config لتصنيف المناطق هنا كجافة / طبيعية / رطبة.',
    },
    zones: { en: 'Zones', ar: 'المناطق' },
    liveControllerState: { en: 'live controller state', ar: 'حالة وحدة التحكم المباشرة' },
    moistureHistory: { en: 'Soil moisture history', ar: 'سجل رطوبة التربة' },
    samplesRetained: { en: '{n} samples retained', ar: '{n} عيّنة محفوظة' },
  },

  pumpPage: {
    reportedState: { en: 'Pump — reported state', ar: 'المضخة — الحالة المُبلَّغة' },
    realDataFrom: { en: 'real data from Phase 1 telemetry', ar: 'بيانات حقيقية من بيانات المرحلة الأولى' },
    pumpState: { en: 'Pump state', ar: 'حالة المضخة' },
    commandedState: { en: 'commanded state reported by the controller', ar: 'الحالة المُرسَلة من وحدة التحكم' },
    currentRun: { en: 'Current run', ar: 'التشغيل الحالي' },
    sincePumpStart: { en: 'since pump start', ar: 'منذ بدء التشغيل' },
    notRunning: { en: 'not running', ar: 'غير مُشغّلة' },
    startsRecentLog: { en: 'Starts (recent log)', ar: 'مرات التشغيل (السجل الأخير)' },
    fromEventsNotCounter: { en: 'from irrigation events, not a cycle counter', ar: 'من أحداث الري، وليس عدّاد دورات' },
    abnormalStops: { en: 'Abnormal stops', ar: 'حالات التوقف غير الطبيعي' },
    timeoutFaultBreakdown: { en: '{timeouts} timeout · {faults} actuator fault', ar: '{timeouts} انتهاء مهلة · {faults} عطل مُشغِّل' },
    conditionMonitoring: { en: 'Pump condition monitoring', ar: 'مراقبة حالة المضخة' },
    conditionReason: {
      en: 'The Phase 1 hardware has no pump instrumentation. There is no current sensor, temperature probe or accelerometer on the pump, and no such fields exist in the telemetry schema. These readings are shown as unavailable rather than estimated from runtime, which would be a guess presented as a measurement.',
      ar: 'لا تحتوي أجهزة المرحلة الأولى على أدوات قياس للمضخة. لا يوجد مستشعر تيار، أو مسبار حرارة، أو مقياس اهتزاز على المضخة، ولا توجد هذه الحقول في مخطط البيانات. تُعرض هذه القراءات كغير متاحة بدلاً من تقديرها من زمن التشغيل، لأن ذلك سيكون تخمينًا يُقدَّم على أنه قياس.',
    },
    motorCurrent: { en: 'Motor current (A)', ar: 'تيار المحرك (أمبير)' },
    windingTemp: { en: 'Winding temperature (°C)', ar: 'درجة حرارة الملف (°م)' },
    vibration: { en: 'Vibration (RMS)', ar: 'الاهتزاز (RMS)' },
    healthScore: { en: 'Health score', ar: 'مؤشر الحالة' },
    anomalyStatus: { en: 'Anomaly status', ar: 'حالة الشذوذ' },
    historicalTrends: { en: 'Historical trends', ar: 'الاتجاهات التاريخية' },
    predictiveMaintenance: { en: 'Predictive maintenance', ar: 'الصيانة التنبؤية' },
    predictiveReason: {
      en: 'No predictive model exists yet, and none will be claimed before one is implemented and validated against real failure data. Remaining useful life, failure probability and maintenance scheduling belong to a later phase.',
      ar: 'لا يوجد نموذج تنبؤي حتى الآن، ولن يُدَّعى وجوده قبل تنفيذه والتحقق منه مقابل بيانات أعطال حقيقية. عمر التشغيل المتبقي واحتمالية العطل وجدولة الصيانة تنتمي إلى مرحلة لاحقة.',
    },
    remainingLife: { en: 'Remaining useful life', ar: 'عمر التشغيل المتبقي' },
    failureProbability: { en: 'Failure probability', ar: 'احتمالية العطل' },
    maintenanceDue: { en: 'Maintenance due', ar: 'موعد الصيانة' },
    degradationTrend: { en: 'Degradation trend', ar: 'اتجاه التدهور' },
  },

  waterPage: {
    networkState: { en: 'Network state', ar: 'حالة الشبكة' },
    realActuatorStates: { en: 'real actuator states', ar: 'حالات المُشغِّلات الحقيقية' },
    zoneValve: { en: 'Zone {n} valve', ar: 'صمام المنطقة {n}' },
    waterFlowing: { en: 'water flowing', ar: 'المياه تتدفق' },
    noFlowCommanded: { en: 'no flow commanded', ar: 'لا يوجد أمر تدفق' },
    flowRate: { en: 'Flow rate', ar: 'معدل التدفق' },
    noFlowSensorFitted: { en: 'no flow sensor fitted', ar: 'لا يوجد مستشعر تدفق مُركَّب' },
    distribution: { en: 'Distribution', ar: 'التوزيع' },
    flowAndConsumption: { en: 'Flow and consumption', ar: 'التدفق والاستهلاك' },
    flowReason: {
      en: 'No flow meter is fitted, so volumetric flow and water consumption cannot be measured. They are deliberately not inferred from pump runtime: without a calibrated flow rate that figure would be a fabrication, and it would be wrong exactly when it matters — a blocked line or a burst pipe both run the pump while moving very different volumes.',
      ar: 'لا يوجد عدّاد تدفق مُركَّب، لذا لا يمكن قياس التدفق الحجمي واستهلاك المياه. لا يتم استنتاجهما عمدًا من زمن تشغيل المضخة: فبدون معدل تدفق معايَر، سيكون الرقم مُلفَّقًا، وسيكون خاطئًا تحديدًا حين يهم الأمر — فخط مسدود أو أنبوب متفجر كلاهما يُشغّل المضخة لكن بحجوم مياه مختلفة جدًا.',
    },
    flowRateUnit: { en: 'Flow rate (L/min)', ar: 'معدل التدفق (لتر/دقيقة)' },
    consumptionPerRun: { en: 'Consumption per run', ar: 'الاستهلاك لكل تشغيل' },
    dailySeasonalTotals: { en: 'Daily / seasonal totals', ar: 'الإجماليات اليومية / الموسمية' },
    perZoneVolume: { en: 'Per-zone volume', ar: 'الحجم لكل منطقة' },
    leakDetection: { en: 'Leak detection', ar: 'كشف التسريب' },
    leakReason: {
      en: 'Leak detection requires flow instrumentation that does not exist on this hardware. No leak status is displayed, because showing a reassuring "no leak" from a system that cannot detect one would be worse than showing nothing.',
      ar: 'يتطلب كشف التسريب أجهزة قياس تدفق غير موجودة في هذا العتاد. لا تُعرض حالة تسريب، لأن إظهار "لا يوجد تسريب" بشكل مطمئن من نظام لا يستطيع كشفه أسوأ من عدم إظهار شيء.',
    },
    leakStatus: { en: 'Leak status', ar: 'حالة التسريب' },
    affectedZone: { en: 'Affected zone', ar: 'المنطقة المتأثرة' },
    estimatedLossRate: { en: 'Estimated loss rate', ar: 'معدل الفقد التقديري' },
    localization: { en: 'Localization', ar: 'تحديد الموقع' },
  },

  safetyPage: {
    failsafeState: { en: 'Fail-safe state', ar: 'حالة الأمان' },
    realSafetyTelemetry: { en: 'real safety telemetry', ar: 'بيانات أمان حقيقية' },
    controllerStatus: { en: 'Controller status', ar: 'حالة وحدة التحكم' },
    allSubsystemsNominal: { en: 'all subsystems nominal', ar: 'جميع الأنظمة الفرعية طبيعية' },
    seeSafetyConditions: { en: 'see safety conditions below', ar: 'راجع حالات الأمان أدناه' },
    actuatorInterlock: { en: 'Actuator interlock', ar: 'قفل التأمين للمُشغِّلات' },
    latchedOff: { en: 'LATCHED OFF', ar: 'مُقفَل ومُطفأ' },
    armed: { en: 'ARMED', ar: 'مُفعَّل' },
    requiresFaultClear: { en: 'requires an operator fault clear', ar: 'يتطلب مسح العطل من قِبل المشغّل' },
    noActuatorFault: { en: 'no actuator fault', ar: 'لا يوجد عطل في المُشغِّلات' },
    sensorIntegrity: { en: 'Sensor integrity', ar: 'سلامة المستشعرات' },
    noValidData: { en: 'NO VALID DATA', ar: 'لا توجد بيانات صالحة' },
    ok: { en: 'OK', ar: 'سليمة' },
    irrigationHeldOff: { en: 'irrigation held off — failing safe', ar: 'تم إيقاف الري — وضع آمن' },
    usableReadingsPresent: { en: 'usable readings present', ar: 'توجد قراءات قابلة للاستخدام' },
    runtimeCutOuts: { en: 'Runtime cut-outs', ar: 'حالات القطع بسبب تجاوز المدة' },
    maxRuntimeAborts: { en: 'maximum-runtime aborts in the recent log', ar: 'حالات إيقاف بسبب تجاوز الحد الأقصى للمدة في السجل الأخير' },
    firmwareInterlocks: { en: 'Firmware safety interlocks', ar: 'أقفال الأمان في البرنامج الثابت' },
    coveredByTests: { en: 'covered by the firmware test suite', ar: 'مُغطّاة بمجموعة اختبارات البرنامج الثابت' },
    outputsDeenergized: { en: 'Outputs de-energized at startup', ar: 'إيقاف تغذية المخرجات عند بدء التشغيل' },
    pumpBlocked: { en: 'Pump blocked with all valves closed', ar: 'منع تشغيل المضخة مع إغلاق جميع الصمامات' },
    oneValveAtATime: { en: 'One zone valve open at a time', ar: 'فتح صمام منطقة واحدة فقط في كل مرة' },
    maxRuntimeCutoff: { en: 'Maximum runtime cut-off', ar: 'قطع تلقائي عند الحد الأقصى للمدة' },
    independentOfNetwork: { en: 'Irrigation independent of network', ar: 'الري مستقل عن الشبكة' },
    enforced: { en: 'ENFORCED', ar: 'مُفعَّل' },
    safetyEvents: { en: 'Safety events', ar: 'أحداث الأمان' },
    noSafetyEvents: { en: 'No safety events', ar: 'لا توجد أحداث أمان' },
    noFaultReported: { en: 'No fault, shutdown or timeout has been reported.', ar: 'لم يُبلَّغ عن أي عطل أو إيقاف أو تجاوز مدة.' },
    envSensing: { en: 'Environmental safety sensing', ar: 'استشعار السلامة البيئية' },
    envReason: {
      en: 'No environmental safety sensors are fitted to this device. Ambient temperature, gas, smoke and water-ingress detection are not part of the Phase 1 hardware and do not appear in the telemetry schema. A dashboard showing green for a hazard it cannot detect is worse than one showing nothing.',
      ar: 'لا توجد مستشعرات سلامة بيئية على هذا الجهاز. درجة الحرارة المحيطة، والغاز، والدخان، وكشف تسرب المياه ليست جزءًا من عتاد المرحلة الأولى ولا تظهر في مخطط البيانات. عرض لوحة تحكم خضراء لخطر لا تستطيع كشفه أسوأ من عدم عرض شيء.',
    },
    ambientTemp: { en: 'Ambient temperature', ar: 'درجة الحرارة المحيطة' },
    gasDetection: { en: 'Gas detection', ar: 'كشف الغاز' },
    smokeDetection: { en: 'Smoke detection', ar: 'كشف الدخان' },
    waterFloodDetection: { en: 'Water / flood detection', ar: 'كشف المياه / الفيضان' },
    emergencyStop: { en: 'Hardware emergency stop', ar: 'إيقاف طارئ للعتاد' },
  },

  alertsPage: {
    activeAlerts: { en: 'Active alerts', ar: 'التنبيهات النشطة' },
    openCount: { en: '{n} open', ar: '{n} مفتوح' },
    noAlertsInCategory: { en: 'No active alerts in this category', ar: 'لا توجد تنبيهات نشطة في هذه الفئة' },
    alertsClearThemselves: { en: 'Alerts clear themselves when the underlying condition ends.', ar: 'تُغلق التنبيهات تلقائيًا عند انتهاء الحالة المسبِّبة لها.' },
    eventTimeline: { en: 'Event timeline', ar: 'الجدول الزمني للأحداث' },
    fromEventLog: { en: 'from the controller event log', ar: 'من سجل أحداث وحدة التحكم' },
    noEventsInCategory: { en: 'No events in this category', ar: 'لا توجد أحداث في هذه الفئة' },
    tryDifferentFilter: { en: 'Try a different filter.', ar: 'جرّب مرشِّحًا مختلفًا.' },
    resolvedAlerts: { en: 'Resolved alerts', ar: 'التنبيهات التي تم حلّها' },
    noResolvedYet: { en: 'No resolved alerts yet', ar: 'لا توجد تنبيهات محلولة بعد' },
    clearedKeptHere: { en: 'Cleared alerts are kept here for history.', ar: 'تُحفظ التنبيهات المحلولة هنا للسجل التاريخي.' },
    cleared: { en: 'cleared {time}', ar: 'أُغلق {time}' },
    noEventsRecorded: { en: 'No events recorded yet', ar: 'لم يتم تسجيل أي أحداث بعد' },
    eventsAppearHere: { en: 'Controller events appear here as they happen.', ar: 'تظهر أحداث وحدة التحكم هنا فور وقوعها.' },
  },

  categories: {
    ALL: { en: 'ALL', ar: 'الكل' },
    IRRIGATION: { en: 'IRRIGATION', ar: 'الري' },
    PUMP: { en: 'PUMP', ar: 'المضخة' },
    WATER: { en: 'WATER', ar: 'المياه' },
    SAFETY: { en: 'SAFETY', ar: 'الأمان' },
    SYSTEM: { en: 'SYSTEM', ar: 'النظام' },
  },

  devicePage: {
    status: { en: 'Status', ar: 'الحالة' },
    dataSource: { en: 'Data source', ar: 'مصدر البيانات' },
    demo: { en: 'DEMO', ar: 'تجريبي' },
    live: { en: 'LIVE', ar: 'مباشر' },
    offline: { en: 'OFFLINE', ar: 'غير متصل' },
    syntheticTelemetry: { en: 'synthetic telemetry — not field data', ar: 'بيانات اصطناعية — وليست بيانات حقلية' },
    liveHardwareTelemetry: { en: 'live hardware telemetry', ar: 'بيانات حية من العتاد' },
    noRecentTelemetry: { en: 'no recent telemetry', ar: 'لا توجد بيانات حديثة' },
    connection: { en: 'Connection', ar: 'الاتصال' },
    lastSeen: { en: 'last seen {time}', ar: 'آخر ظهور {time}' },
    backend: { en: 'Backend', ar: 'الخادم' },
    unreachable: { en: 'UNREACHABLE', ar: 'غير قابل للوصول' },
    connected: { en: 'CONNECTED', ar: 'متصل' },
    apiResponding: { en: 'dashboard API responding', ar: 'واجهة برمجة اللوحة تستجيب' },
    wifi: { en: 'Wi-Fi', ar: 'واي فاي' },
    wifiConnected: { en: 'CONNECTED', ar: 'متصل' },
    wifiDisconnected: { en: 'DISCONNECTED', ar: 'غير متصل' },
    notReported: { en: 'not reported', ar: 'غير مُبلَّغ' },
    deviceDetail: { en: 'Device detail', ar: 'تفاصيل الجهاز' },
    deviceId: { en: 'Device ID', ar: 'معرّف الجهاز' },
    firmware: { en: 'Firmware', ar: 'البرنامج الثابت' },
    lastTelemetry: { en: 'Last telemetry', ar: 'آخر بيانات' },
    deviceUptime: { en: 'Device uptime', ar: 'مدة تشغيل الجهاز' },
    deviceClock: { en: 'Device clock', ar: 'ساعة الجهاز' },
    telemetrySamplesStored: { en: 'Telemetry samples stored', ar: 'عدد عيّنات البيانات المخزَّنة' },
    demoSimulationTitle: { en: 'DEMO / SIMULATION.', ar: 'تجريبي / محاكاة.' },
    demoSimulationBody: {
      en: 'This device is publishing synthetic telemetry from the mock device fixture. The values shown are scripted, not measured from soil.',
      ar: 'يُصدر هذا الجهاز بيانات اصطناعية من جهاز محاكاة. القيم المعروضة مُبرمَجة مسبقًا، وليست مقاسة من التربة.',
    },
  },

  coverage: {
    ok: { en: 'OK', ar: 'سليمة' },
    degraded: { en: 'DEGRADED — 1 OF 2', ar: 'متدهورة — 1 من 2' },
    noValidProbe: { en: 'NO VALID PROBE', ar: 'لا يوجد مسبار صالح' },
  },

  moistureStatus: {
    noBandSet: { en: 'NO BAND SET', ar: 'لا يوجد نطاق مُحدَّد' },
    dry: { en: 'DRY', ar: 'جاف' },
    wet: { en: 'WET', ar: 'رطب' },
    normal: { en: 'NORMAL', ar: 'طبيعي' },
  },

  irrigationState: {
    IDLE: { en: 'IDLE', ar: 'خامل' },
    CHECKING_SOIL: { en: 'CHECKING SOIL', ar: 'فحص التربة' },
    IRRIGATION_REQUIRED: { en: 'IRRIGATION REQUIRED', ar: 'الري مطلوب' },
    STARTING: { en: 'STARTING', ar: 'جارٍ البدء' },
    IRRIGATING: { en: 'IRRIGATING', ar: 'جارٍ الري' },
    STOPPING: { en: 'STOPPING', ar: 'جارٍ الإيقاف' },
    SENSOR_ERROR: { en: 'SENSOR ERROR', ar: 'خطأ في المستشعر' },
    ACTUATOR_ERROR: { en: 'ACTUATOR ERROR', ar: 'خطأ في المُشغِّل' },
    TIMEOUT: { en: 'TIMEOUT', ar: 'انتهاء المهلة' },
  },

  controllerStatus: {
    OK: { en: 'OK', ar: 'سليم' },
    DEGRADED: { en: 'DEGRADED', ar: 'متدهور' },
    SENSOR_ERROR: { en: 'SENSOR ERROR', ar: 'خطأ في المستشعر' },
    ACTUATOR_ERROR: { en: 'ACTUATOR ERROR', ar: 'خطأ في المُشغِّل' },
  },

  eventType: {
    CONTROLLER_STARTED: { en: 'Controller Started', ar: 'بدء تشغيل وحدة التحكم' },
    ZONE_ACTIVATED: { en: 'Zone Activated', ar: 'تفعيل المنطقة' },
    IRRIGATION_STARTED: { en: 'Irrigation Started', ar: 'بدء الري' },
    IRRIGATION_STOPPED: { en: 'Irrigation Stopped', ar: 'توقف الري' },
    IRRIGATION_TIMEOUT: { en: 'Irrigation Timeout', ar: 'انتهاء مهلة الري' },
    SENSOR_ERROR: { en: 'Sensor Error', ar: 'خطأ في المستشعر' },
    SENSOR_RECOVERED: { en: 'Sensor Recovered', ar: 'استعادة المستشعر' },
    ACTUATOR_ERROR: { en: 'Actuator Error', ar: 'خطأ في المُشغِّل' },
    FAULT_CLEARED: { en: 'Fault Cleared', ar: 'تم مسح العطل' },
    SAFE_SHUTDOWN: { en: 'Safe Shutdown', ar: 'إيقاف آمن' },
  },

  alertType: {
    SENSOR_ERROR: { en: 'Sensor Error', ar: 'خطأ في المستشعر' },
    IRRIGATION_TIMEOUT: { en: 'Irrigation Timeout', ar: 'انتهاء مهلة الري' },
    ACTUATOR_ERROR: { en: 'Actuator Error', ar: 'خطأ في المُشغِّل' },
    DEVICE_OFFLINE: { en: 'Device Offline', ar: 'الجهاز غير متصل' },
  },

  chart: {
    notEnoughHistory: { en: 'Not enough history yet', ar: 'لا يوجد سجل كافٍ بعد' },
    notEnoughDetail: {
      en: 'A chart appears once at least two telemetry samples have been recorded.',
      ar: 'يظهر الرسم البياني بعد تسجيل عيّنتَي بيانات على الأقل.',
    },
    ran: { en: 'ran {duration}', ar: 'استمر {duration}' },
    samples: { en: '{n} samples', ar: '{n} عيّنة' },
    now: { en: 'now {value}%', ar: 'الآن {value}%' },
    noThreshold: { en: 'no threshold configured', ar: 'لا يوجد عتبة مُعدَّة' },
    startStop: { en: 'start {start}% · stop {stop}%', ar: 'بدء {start}% · إيقاف {stop}%' },
  },

  farm: {
    waterFlowingOpen: { en: 'Water flowing / valve open', ar: 'المياه تتدفق / الصمام مفتوح' },
    idle: { en: 'Idle', ar: 'خامل' },
    degradedCoverage: { en: 'Degraded sensor coverage', ar: 'تغطية مستشعرات متدهورة' },
    fillHeightNote: { en: 'Fill height = zone average moisture', ar: 'ارتفاع التعبئة = متوسط رطوبة المنطقة' },
    pump: { en: 'PUMP', ar: 'المضخة' },
    on: { en: 'ON', ar: 'تشغيل' },
    off: { en: 'OFF', ar: 'إيقاف' },
    valveOpen: { en: 'VALVE OPEN', ar: 'الصمام مفتوح' },
    valveClosed: { en: 'VALVE CLOSED', ar: 'الصمام مغلق' },
    noValidProbe: { en: 'NO VALID PROBE', ar: 'لا يوجد مسبار صالح' },
    degraded: { en: 'DEGRADED', ar: 'متدهورة' },
  },

  ui: {
    uiPreparedFor: { en: 'UI prepared for', ar: 'الواجهة مُجهَّزة من أجل' },
  },
};

/* ========================================================================= */
/* engine                                                                    */
/* ========================================================================= */

function readStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(stored) ? stored : DEFAULT_LANG;
  } catch {
    // Private tab / storage blocked: fall back silently, nothing breaks.
    return DEFAULT_LANG;
  }
}

let currentLang = readStoredLang();

export function getLang() {
  return currentLang;
}

export function isRtl(lang = currentLang) {
  return lang === 'ar';
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Preference just won't survive a reload in this browser; the toggle
    // itself still works for the rest of the session.
  }
  applyDocumentDirection();
  for (const listener of listeners) listener(lang);
}

/** Sets <html lang> and dir so the *entire* page — not just JS-rendered
 *  content — lays out and reads correctly, including the static shell in
 *  index.html that this module does not itself render. */
export function applyDocumentDirection() {
  const root = document.documentElement;
  root.lang = currentLang;
  root.dir = isRtl() ? 'rtl' : 'ltr';
}

/** Called whenever the language changes, so the app can re-render live state
 *  without a page reload. */
export function onLangChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Looks up `path` (e.g. "overview.soilMoisture") in the active language,
 * interpolating `{name}` placeholders from `vars`. Falls back to English,
 * then to the raw path, rather than throwing — a dashboard must not go blank
 * because one label is missing.
 */
export function t(path, vars) {
  const segments = path.split('.');
  let node = STRINGS;
  for (const segment of segments) {
    node = node && typeof node === 'object' ? node[segment] : undefined;
  }
  if (!node) return path;

  const entry = node[currentLang] ?? node[DEFAULT_LANG];
  if (typeof entry !== 'string') return path;
  if (!vars) return entry;

  return entry.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Translates every element carrying `data-i18n` (textContent) or
 * `data-i18n-aria-label` (the aria-label attribute) under `root` — the small
 * set of labels that live as static markup in index.html rather than being
 * rendered by views.js. Call once on boot and again on every language change.
 */
export function applyStaticTranslations(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-aria-label]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  }
}

applyDocumentDirection();
