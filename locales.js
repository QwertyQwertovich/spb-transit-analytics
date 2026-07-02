const LOCALES = {
  "tab_groups": { ru: "Группа", en: "Group" },
  "js_min": { ru: "Мин", en: "Min" },
  "js_max": { ru: "Макс", en: "Max" },
  "js_all_ops": { ru: "Все", en: "All" },
  "type_bus": { ru: "Автобус", en: "Bus" },
  "type_tram": { ru: "Трамвай", en: "Tram" },
  "type_trolleybus": { ru: "Троллейбус", en: "Trolleybus" },

  "title": { ru: "SPb Transit Analytics — Средняя скорость маршрутов", en: "SPb Transit Analytics — Average Route Speeds" },
  "loading_title": { ru: "Загрузка данных…", en: "Loading data..." },
  "loading_sub": { ru: "Это может занять несколько секунд", en: "This may take a few seconds" },
  "badge_gtfs": { ru: "Расписание ГТФС", en: "GTFS Schedule" },
  "loading_meta": { ru: "Загрузка…", en: "Loading..." },
  "tab_overview": { ru: "Обзор", en: "Overview" },
  "tab_routes": { ru: "Маршруты", en: "Routes" },
  "tab_compare": { ru: "Сравнение", en: "Compare" },
  "tab_districts": { ru: "Районы", en: "Districts" },
  "tab_operators": { ru: "Перевозчики", en: "Operators" },
  "tab_types": { ru: "Типы ТС", en: "Transport Types" },
  "tab_map": { ru: "Карта", en: "Map" },
  
  "overview_dist": { ru: "Распределение медианных скоростей маршрутов", en: "Distribution of Median Route Speeds" },
  "overview_type": { ru: "Скорость по типам транспорта", en: "Speed by Transport Type" },
  "overview_top": { ru: "Топ-10 быстрых и топ-10 медленных маршрутов", en: "Top 10 Fastest and Slowest Routes" },
  
  "filter_search": { ru: "Поиск по номеру или названию…", en: "Search by number or name..." },
  "filter_type": { ru: "Тип", en: "Type" },
  "filter_type_full": { ru: "Тип ТС", en: "Transport Type" },
  "filter_all": { ru: "Все", en: "All" },
  "filter_bus": { ru: "Автобус", en: "Bus" },
  "filter_bus_city": { ru: "Автобус (город)", en: "Bus (City)" },
  "filter_tram": { ru: "Трамвай", en: "Tram" },
  "filter_trolleybus": { ru: "Троллейбус", en: "Trolleybus" },
  "filter_operator": { ru: "Перевозчик", en: "Operator" },
  "filter_district": { ru: "Район", en: "District" },
  "filter_network": { ru: "Сеть", en: "Network" },
  "filter_urban": { ru: "Городские", en: "Urban" },
  "filter_suburban": { ru: "Пригородные", en: "Suburban" },
  "filter_reset": { ru: "✕ Сбросить", en: "✕ Reset" },
  
  "th_no": { ru: "№", en: "No." },
  "th_median": { ru: "Медиана", en: "Median" },
  "th_mean": { ru: "Среднее", en: "Mean" },
  "th_km": { ru: "Км", en: "Km" },
  "th_districts": { ru: "Районы", en: "Districts" },
  
  "cmp_sentence_1": { ru: "Сравнить", en: "Compare" },
  "cmp_sentence_2": { ru: "по средней скорости", en: "by average speed" },
  "cmp_opt_ops": { ru: "перевозчиков", en: "operators" },
  "cmp_opt_districts": { ru: "районы", en: "districts" },
  "cmp_opt_types": { ru: "типы транспорта", en: "transport types" },
  "cmp_filter_by": { ru: "Фильтровать по:", en: "Filter by:" },
  "cmp_all_types": { ru: "Все типы", en: "All types" },
  "cmp_all_districts": { ru: "Все районы", en: "All districts" },
  "cmp_all_ops": { ru: "Все перевозчики", en: "All operators" },
  
  "dist_speed": { ru: "Медиана скорости по районам, км/ч", en: "Median speed by districts, km/h" },
  "dist_iqr": { ru: "Разброс скоростей (Q25 / медиана / Q75)", en: "Speed spread (Q25 / median / Q75)" },
  
  "op_speed": { ru: "Медиана скорости по перевозчикам", en: "Median speed by operators" },
  "op_routes": { ru: "Маршруты и км по перевозчику", en: "Routes and km by operator" },
  
  "type_detail": { ru: "Детальное сравнение типов ТС", en: "Detailed transport type comparison" },
  "type_speed": { ru: "Скорость по типам транспорта (Q25 / Медиана / Q75)", en: "Speed by transport type (Q25 / Median / Q75)" },
  
  "map_speed": { ru: "Скорость", en: "Speed" },
  "map_from": { ru: "от", en: "from" },
  "map_to": { ru: "до", en: "to" },
  "map_kmh": { ru: "км/ч", en: "km/h" },
  
  "unknown_operator": { ru: "Неизвестный", en: "Unknown" },
  "unit_routes": { ru: "маршрутов", en: "routes" },
  "unit_stops": { ru: "остановок", en: "stops" },
  "unit_districts": { ru: "районов", en: "districts" },
  "unit_kmh": { ru: "км/ч", en: "km/h" },
  "unit_kmh_median": { ru: "км/ч (медиана)", en: "km/h (median)" },
  "unit_mln_km": { ru: "млн км", en: "mln km" },
  
  "kpi_routes": { ru: "Маршрутов", en: "Routes" },
  "kpi_ops": { ru: "Перевозчиков", en: "Operators" },
  "kpi_stops": { ru: "Остановок", en: "Stops" },
  "kpi_districts": { ru: "Районов", en: "Districts" },
  "kpi_speed": { ru: "Средняя скорость", en: "Average Speed" },
  "kpi_speed_mean": { ru: "Среднее арифм.", en: "Mean Speed" },
  "kpi_km": { ru: "Запланировано", en: "Planned" },
  
  "js_no_data": { ru: "Нет данных для отображения", en: "No data to display" },
  "js_routes_count": { ru: "маршрутов", en: "routes" },
  "js_showing": { ru: "Показано", en: "Showing" },
  "js_out_of": { ru: "из", en: "out of" },
  
  "js_compare_ops": { ru: "перевозчики", en: "operators" },
  "js_compare_dist": { ru: "районы", en: "districts" },
  "js_compare_types": { ru: "типы ТС", en: "transport types" },
  "js_cmp_title_prefix": { ru: "Сравнение: ", en: "Comparison: " },
  
  "js_speed_median": { ru: "Медиана", en: "Median" },
  "js_speed_mean": { ru: "Среднее", en: "Mean" },
  "js_speed_minmax": { ru: "Мин / Макс", en: "Min / Max" },
  "js_total_km": { ru: "Млн км.", en: "Mln km." },
  "js_total_km_planned": { ru: "Запланировано км.", en: "Planned km." },
  
  "js_map_route": { ru: "Маршрут", en: "Route" },
  "js_map_type": { ru: "Тип", en: "Type" },
  "js_map_op": { ru: "Перевозчик", en: "Operator" },
  "js_map_speed": { ru: "Ср. скорость", en: "Avg. speed" },
  
  "js_error": { ru: "Ошибка загрузки данных.", en: "Error loading data." },
  "js_error_sub": { ru: "Подсказка: python -m http.server 8080", en: "Hint: python -m http.server 8080" },
  
  "type_bus": { ru: "Автобус", en: "Bus" },
  "type_bus_city": { ru: "Автобус (город)", en: "Bus (City)" },
  "type_tram": { ru: "Трамвай", en: "Tram" },
  "type_trolleybus": { ru: "Троллейбус", en: "Trolleybus" },
  "type_metro": { ru: "Метро", en: "Metro" }
};

window.t = function(key) {
  const lang = window.state ? (window.state.lang || 'ru') : 'ru';
  return LOCALES[key] ? (LOCALES[key][lang] || LOCALES[key]['ru']) : key;
};

window.translateDOM = function() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
      el.setAttribute('placeholder', window.t(key));
    } else {
      const textSpan = el.querySelector('.i18n-text');
      if (textSpan) textSpan.textContent = window.t(key);
      else el.textContent = window.t(key);
    }
  });
  document.title = window.t('title');
};
