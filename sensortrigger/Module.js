/**
 * Sensor Trigger Extension for PILOT
 * 
 * Назначение: позволяет задавать точки на карте для идентификаторов датчиков.
 * При срабатывании датчика (симуляция) транспортное средство перемещается в заданную точку.
 * 
 * Соответствует AI_SPECS.md и требованиям промта.
 * Исправлена ошибка с Ext.EventManager.onWindowResize.
 */

Ext.define('Store.sensortrigger.Module', {
    extend: 'Ext.Component',

    /**
     * Основной метод инициализации расширения.
     * Вызывается PILOT после загрузки Module.js.
     */
    initModule: function() {
        var me = this;

        // Проверка наличия skeleton и карты
        if (!window.skeleton) {
            Ext.log.error('sensortrigger: skeleton not found');
            return;
        }
        if (!window.mapContainer && !window.getActiveTabMapContainer) {
            Ext.log.error('sensortrigger: map container not found');
            return;
        }

        // Инициализация флагов для работы с картой
        me.waitingForMapClick = false;
        me.pendingAddWindow = null;

        // Сохраняем ссылку на модуль глобально для вызовов из симуляции
        window.sensortriggerModule = me;

        // Загружаем список ТС из PILOT
        me.loadVehicles();

        // Создаём левую навигационную вкладку
        me.createNavigationTab();

        // Создаём правую плавающую панель управления
        me.createControlPanel();

        // Инициализируем хранилище точек триггера из localStorage
        me.loadTriggerPoints();

        // Добавляем существующие точки на карту
        me.renderTriggerPointsOnMap();

        // Настраиваем слушатель клика на карте для выбора координат
        me.setupMapClickListener();

        Ext.log('sensortrigger: extension initialized');
    },

    // ----------------------------------------------------------------------
    // 1. Загрузка транспортных средств из /ax/tree.php
    // ----------------------------------------------------------------------

    /**
     * Загружает иерархический список групп и ТС.
     * Результат сохраняется в store для грида в левой вкладке.
     */
    loadVehicles: function() {
        var me = this;

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: {
                vehs: 1,
                state: 1
            },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                // Преобразуем иерархию в плоский список
                var vehicles = me.flattenVehicleTree(data);
                me.vehiclesStore = Ext.create('Ext.data.Store', {
                    fields: ['vehid', 'name', 'vin', 'model', 'year'],
                    data: vehicles
                });
                // Если грид уже создан, обновим его store
                if (me.vehicleGrid) {
                    me.vehicleGrid.reconfigure(me.vehiclesStore);
                }
                // Также создаём мок-сенсоры для каждого ТС
                me.mockSensors = {};
                vehicles.forEach(function(vehicle) {
                    me.mockSensors[vehicle.vehid] = me.generateMockSensors(vehicle.vehid);
                });
                Ext.log('sensortrigger: loaded ' + vehicles.length + ' vehicles');
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список транспортных средств.');
            }
        });
    },

    /**
     * Рекурсивно превращает дерево групп/ТС в плоский массив объектов.
     */
    flattenVehicleTree: function(nodes, result) {
        result = result || [];
        if (!Ext.isArray(nodes)) return result;
        Ext.Array.each(nodes, function(node) {
            if (node.vehid && node.vehid > 0) {
                // Это транспортное средство
                result.push({
                    vehid: node.vehid,
                    name: node.name || 'N/A',
                    vin: node.vin || '',
                    model: node.model || '',
                    year: node.year || ''
                });
            }
            if (node.children && node.children.length) {
                this.flattenVehicleTree(node.children, result);
            }
        }, this);
        return result;
    },

    /**
     * Генерирует мок-список датчиков для демонстрации.
     * В реальной системе здесь должен быть запрос к API датчиков PILOT.
     */
    generateMockSensors: function(vehid) {
        return [
            { sensor_id: 'engine_temp_' + vehid, name: 'Температура двигателя', value: 0 },
            { sensor_id: 'fuel_level_' + vehid, name: 'Уровень топлива', value: 0 },
            { sensor_id: 'door_status_' + vehid, name: 'Состояние двери', value: 0 }
        ];
    },

    // ----------------------------------------------------------------------
    // 2. Левая навигационная вкладка (Pattern A)
    // ----------------------------------------------------------------------

    /**
     * Создаёт левую вкладку с гридом транспортных средств.
     * Используется Pilot.utils.LeftBarPanel для совместимости с темой PILOT.
     */
    createNavigationTab: function() {
        var me = this;

        // Создаём панель, которая будет содержимым вкладки
        var navContent = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            items: [{
                xtype: 'gridpanel',
                itemId: 'vehicleGrid',
                title: 'Транспорт',
                store: me.vehiclesStore || Ext.create('Ext.data.Store', { fields: ['vehid', 'name', 'vin', 'model', 'year'] }),
                columns: [
                    { text: l('Название'), dataIndex: 'name', flex: 2 },
                    { text: 'VIN', dataIndex: 'vin', flex: 2 },
                    { text: l('Модель'), dataIndex: 'model', flex: 1 },
                    { text: l('Год'), dataIndex: 'year', flex: 1, align: 'center' }
                ],
                listeners: {
                    select: function(grid, record) {
                        // При выборе ТС можно показать его датчики (опционально)
                        var vehid = record.get('vehid');
                        var sensors = me.mockSensors[vehid] || [];
                        var sensorStr = sensors.map(function(s) { return s.name + ' (' + s.sensor_id + ')'; }).join(', ');
                        Ext.Msg.show({
                            title: 'Датчики',
                            message: 'Доступные датчики для ' + record.get('name') + ':\n' + (sensorStr || 'нет'),
                            buttons: Ext.Msg.OK,
                            icon: Ext.Msg.INFO
                        });
                    }
                }
            }]
        });

        // Создаём вкладку с помощью LeftBarPanel
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Sensor Triggers'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [navContent]
        });

        // Сохраняем ссылку на грид для обновления store позже
        me.vehicleGrid = navContent.down('#vehicleGrid');

        // Добавляем вкладку в левую панель навигации
        skeleton.navigation.add(navTab);
    },

    // ----------------------------------------------------------------------
    // 3. Правая плавающая панель управления
    // ----------------------------------------------------------------------

    /**
     * Создаёт панель управления, которая прикрепляется к правому краю окна.
     * Содержит кнопки, список точек триггера и лог событий.
     */
    createControlPanel: function() {
        var me = this;

        // Хранилище для точек триггера
        me.triggerPointsStore = Ext.create('Ext.data.Store', {
            fields: ['sensorId', 'lat', 'lon', 'label'],
            data: []
        });

        // Хранилище для лога событий
        me.logStore = Ext.create('Ext.data.Store', {
            fields: ['timestamp', 'vehicleName', 'sensorId', 'targetLabel'],
            data: []
        });

        // Панель со списком точек (для отображения в правой панели)
        var pointsGrid = Ext.create('Ext.grid.Panel', {
            title: l('Точки триггеров'),
            store: me.triggerPointsStore,
            columns: [
                { text: 'Sensor ID', dataIndex: 'sensorId', flex: 2 },
                { text: l('Метка'), dataIndex: 'label', flex: 2 },
                { text: l('Координаты'), dataIndex: 'lat', flex: 1, renderer: function(v, m, rec) { return rec.get('lat') + ', ' + rec.get('lon'); } }
            ],
            height: 200,
            tbar: [{
                text: l('Добавить'),
                iconCls: 'fa fa-plus',
                handler: function() { me.showAddTriggerWindow(); }
            }, {
                text: l('Удалить'),
                iconCls: 'fa fa-trash',
                handler: function() {
                    var selected = pointsGrid.getSelectionModel().getSelection();
                    if (selected.length) {
                        me.deleteTriggerPoint(selected[0]);
                    } else {
                        Ext.Msg.alert(l('Внимание'), l('Выберите точку для удаления.'));
                    }
                }
            }],
            listeners: {
                select: function(grid, record) {
                    // При выборе точки можно центрировать карту на ней
                    var map = me.getPilotMap();
                    if (map && map.setMapCenter) {
                        map.setMapCenter(record.get('lat'), record.get('lon'));
                        map.setMapZoom(15);
                    }
                }
            }
        });

        // Лог событий
        var logGrid = Ext.create('Ext.grid.Panel', {
            title: l('Журнал срабатываний'),
            store: me.logStore,
            columns: [
                { text: l('Время'), dataIndex: 'timestamp', width: 120 },
                { text: l('ТС'), dataIndex: 'vehicleName', flex: 2 },
                { text: 'Sensor ID', dataIndex: 'sensorId', flex: 2 },
                { text: l('Точка'), dataIndex: 'targetLabel', flex: 2 }
            ],
            height: 200
        });

        // Главная панель управления (плавающая, прикреплённая к правому краю)
        me.controlPanel = Ext.create('Ext.panel.Panel', {
            floating: true,
            width: 400,
            shadow: true,
            draggable: false,
            resizable: false,
            cls: 'sensortrigger-right-panel',
            layout: 'border',
            title: l('Управление датчиками'),
            tools: [{
                type: 'close',
                handler: function() { me.controlPanel.hide(); }
            }],
            items: [{
                region: 'north',
                xtype: 'toolbar',
                items: [{
                    text: l('Симуляция триггера'),
                    iconCls: 'fa fa-bolt',
                    handler: function() { me.showSimulateWindow(); }
                }]
            }, {
                region: 'center',
                layout: 'fit',
                items: [pointsGrid]
            }, {
                region: 'south',
                height: 220,
                layout: 'fit',
                items: [logGrid]
            }]
        });

        // Размещаем панель в правом верхнем углу (относительно документа)
        me.controlPanel.show();
        me.controlPanel.setPosition(document.documentElement.clientWidth - 410, 80);

        // Безопасное отслеживание изменения размера окна
        // Используем Ext.on (если доступен) или нативный addEventListener
        var resizeHandler = function(width) {
            if (me.controlPanel && me.controlPanel.isVisible()) {
                var w = width || document.documentElement.clientWidth;
                me.controlPanel.setPosition(w - 410, 80);
            }
        };

        if (Ext.on && typeof Ext.on === 'function') {
            // Ext JS способ
            Ext.on('resize', resizeHandler);
        } else if (window.addEventListener) {
            window.addEventListener('resize', function() {
                resizeHandler(document.documentElement.clientWidth);
            });
        } else {
            // Fallback: проверка через интервал (не рекомендуется, но для совместимости)
            var interval = setInterval(function() {
                if (me.controlPanel && me.controlPanel.isVisible()) {
                    resizeHandler(document.documentElement.clientWidth);
                }
            }, 500);
            // Сохраняем интервал для возможной очистки при разрушении модуля
            me._resizeInterval = interval;
        }
    },

    // ----------------------------------------------------------------------
    // 4. Работа с точками триггера (localStorage и карта)
    // ----------------------------------------------------------------------

    /**
     * Загружает точки триггера из localStorage.
     */
    loadTriggerPoints: function() {
        var stored = localStorage.getItem('sensortrigger_points');
        if (stored) {
            try {
                var points = Ext.decode(stored);
                this.triggerPointsStore.loadData(points);
            } catch(e) {}
        }
    },

    /**
     * Сохраняет текущие точки в localStorage.
     */
    saveTriggerPoints: function() {
        var data = [];
        this.triggerPointsStore.each(function(rec) {
            data.push(rec.getData());
        });
        localStorage.setItem('sensortrigger_points', Ext.encode(data));
    },

    /**
     * Добавляет новую точку триггера.
     */
    addTriggerPoint: function(sensorId, lat, lon, label) {
        var me = this;
        var record = Ext.create('Ext.data.Model', {
            fields: ['sensorId', 'lat', 'lon', 'label'],
            data: { sensorId: sensorId, lat: lat, lon: lon, label: label || '' }
        });
        me.triggerPointsStore.add(record);
        me.saveTriggerPoints();
        // Добавляем маркер на карту
        me.addTriggerPointMarker(record);
        Ext.Msg.alert(l('Успех'), l('Точка триггера добавлена.'));
    },

    /**
     * Удаляет точку триггера.
     */
    deleteTriggerPoint: function(record) {
        var me = this;
        me.triggerPointsStore.remove(record);
        me.saveTriggerPoints();
        // Удаляем маркер с карты
        me.removeTriggerPointMarker(record.get('sensorId'));
    },

    /**
     * Отображает все сохранённые точки на карте.
     */
    renderTriggerPointsOnMap: function() {
        var me = this;
        me.triggerPointsStore.each(function(rec) {
            me.addTriggerPointMarker(rec);
        });
    },

    /**
     * Добавляет маркер для точки триггера на карту.
     * Используется MapContainer.addMarker.
     */
    addTriggerPointMarker: function(record) {
        var map = this.getPilotMap();
        if (!map || !map.addMarker) return;
        var markerId = 'trigger_' + record.get('sensorId');
        map.addMarker({
            id: markerId,
            lat: record.get('lat'),
            lon: record.get('lon'),
            hint: record.get('label') || record.get('sensorId'),
            // Можно задать иконку, но оставим стандартную
        });
    },

    /**
     * Удаляет маркер точки триггера с карты.
     */
    removeTriggerPointMarker: function(sensorId) {
        var map = this.getPilotMap();
        if (map && map.removeMarker) {
            map.removeMarker('trigger_' + sensorId);
        }
    },

    // ----------------------------------------------------------------------
    // 5. Работа с картой (существующей)
    // ----------------------------------------------------------------------

    /**
     * Возвращает текущий активный контейнер карты (Online).
     */
    getPilotMap: function() {
        if (window.getActiveTabMapContainer) {
            return getActiveTabMapContainer();
        }
        return window.mapContainer || null;
    },

    /**
     * Настраивает слушатель клика на карте для заполнения координат в окне добавления.
     */
    setupMapClickListener: function() {
        var me = this;
        var map = me.getPilotMap();
        if (!map || !map.map) return;
        map.map.on('click', function(e) {
            if (me.waitingForMapClick) {
                var lat = e.latlng.lat;
                var lng = e.latlng.lng;
                if (me.pendingAddWindow && me.pendingAddWindow.down('textfield[itemId=latField]')) {
                    me.pendingAddWindow.down('textfield[itemId=latField]').setValue(lat);
                    me.pendingAddWindow.down('textfield[itemId=lonField]').setValue(lng);
                }
                me.waitingForMapClick = false;
                Ext.Msg.alert(l('Готово'), l('Координаты добавлены в форму.'));
            }
        });
    },

    /**
     * Показывает окно для добавления новой точки триггера.
     */
    showAddTriggerWindow: function() {
        var me = this;
        var win = Ext.create('Ext.window.Window', {
            title: l('Добавить точку триггера'),
            width: 400,
            modal: true,
            layout: 'anchor',
            defaults: { anchor: '100%', margin: '5 10' },
            items: [{
                xtype: 'textfield',
                fieldLabel: 'Sensor ID',
                itemId: 'sensorIdField',
                allowBlank: false
            }, {
                xtype: 'textfield',
                fieldLabel: l('Метка (опционально)'),
                itemId: 'labelField'
            }, {
                xtype: 'numberfield',
                fieldLabel: l('Широта'),
                itemId: 'latField',
                step: 0.000001,
                allowBlank: false
            }, {
                xtype: 'numberfield',
                fieldLabel: l('Долгота'),
                itemId: 'lonField',
                step: 0.000001,
                allowBlank: false
            }, {
                xtype: 'button',
                text: l('Выбрать на карте'),
                handler: function() {
                    me.waitingForMapClick = true;
                    me.pendingAddWindow = win;
                    Ext.Msg.alert(l('Инструкция'), l('Кликните на карте в нужном месте. Координаты будут вставлены автоматически.'));
                }
            }],
            buttons: [{
                text: l('Сохранить'),
                handler: function() {
                    var sensorId = win.down('#sensorIdField').getValue();
                    var lat = win.down('#latField').getValue();
                    var lon = win.down('#lonField').getValue();
                    var label = win.down('#labelField').getValue();
                    if (!sensorId || !lat || !lon) {
                        Ext.Msg.alert(l('Ошибка'), l('Заполните Sensor ID, широту и долготу.'));
                        return;
                    }
                    me.addTriggerPoint(sensorId, lat, lon, label);
                    win.close();
                    me.waitingForMapClick = false;
                }
            }, {
                text: l('Отмена'),
                handler: function() {
                    win.close();
                    me.waitingForMapClick = false;
                }
            }]
        });
        win.show();
    },

    // ----------------------------------------------------------------------
    // 6. Симуляция триггера и перемещение маркера ТС
    // ----------------------------------------------------------------------

    /**
     * Показывает окно для выбора ТС и Sensor ID, затем вызывает симуляцию.
     */
    showSimulateWindow: function() {
        var me = this;
        if (!me.vehiclesStore || me.vehiclesStore.getCount() === 0) {
            Ext.Msg.alert(l('Ошибка'), l('Список ТС ещё не загружен. Попробуйте позже.'));
            return;
        }

        var vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: l('Транспортное средство'),
            store: me.vehiclesStore,
            displayField: 'name',
            valueField: 'vehid',
            queryMode: 'local',
            allowBlank: false,
            listeners: {
                select: function(combo, records) {
                    var vehid = records[0].get('vehid');
                    var sensors = me.mockSensors[vehid] || [];
                    sensorCombo.store.loadData(sensors);
                    sensorCombo.setValue(null);
                }
            }
        });

        var sensorCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: 'Sensor ID',
            store: Ext.create('Ext.data.Store', { fields: ['sensor_id', 'name'] }),
            displayField: 'name',
            valueField: 'sensor_id',
            queryMode: 'local',
            allowBlank: false
        });

        var win = Ext.create('Ext.window.Window', {
            title: l('Симуляция срабатывания датчика'),
            width: 400,
            modal: true,
            items: [vehicleCombo, sensorCombo],
            buttons: [{
                text: l('Симулировать'),
                handler: function() {
                    var vehid = vehicleCombo.getValue();
                    var sensorId = sensorCombo.getValue();
                    if (!vehid || !sensorId) {
                        Ext.Msg.alert(l('Ошибка'), l('Выберите ТС и Sensor ID.'));
                        return;
                    }
                    win.close();
                    me.simulateTrigger(vehid, sensorId);
                }
            }, {
                text: l('Отмена'),
                handler: function() { win.close(); }
            }]
        });
        win.show();
    },

    /**
     * Основная логика при срабатывании датчика.
     * Ищет точку триггера по sensorId и перемещает ТС.
     * В реальной системе этот метод вызывается через WebSocket/периодический опрос.
     */
    simulateTrigger: function(vehid, sensorId) {
        var me = this;
        // Ищем точку триггера в store
        var triggerRecord = null;
        me.triggerPointsStore.each(function(rec) {
            if (rec.get('sensorId') === sensorId) {
                triggerRecord = rec;
                return false;
            }
        });
        if (!triggerRecord) {
            Ext.Msg.alert(l('Нет точки'), l('Для Sensor ID "' + sensorId + '" не задана точка триггера.'));
            return;
        }

        // Находим название ТС
        var vehicleRecord = me.vehiclesStore.findRecord('vehid', vehid);
        var vehicleName = vehicleRecord ? vehicleRecord.get('name') : 'ID:' + vehid;

        // Перемещаем маркер
        var success = me.moveVehicleMarker(vehid, triggerRecord.get('lat'), triggerRecord.get('lon'));
        if (success) {
            // Добавляем запись в лог
            me.logStore.add({
                timestamp: Ext.Date.format(new Date(), 'Y-m-d H:i:s'),
                vehicleName: vehicleName,
                sensorId: sensorId,
                targetLabel: triggerRecord.get('label') || sensorId
            });
            Ext.Msg.alert(l('Триггер'), l('ТС "' + vehicleName + '" перемещён в точку "' + (triggerRecord.get('label') || sensorId) + '"'));
        } else {
            Ext.Msg.alert(l('Ошибка'), l('Не удалось найти маркер ТС на карте.'));
        }
    },

    /**
     * Перемещает маркер транспортного средства на карте.
     * Использует getMarker + setLatLng (Leaflet) или remove/add.
     */
    moveVehicleMarker: function(vehid, lat, lon) {
        var map = this.getPilotMap();
        if (!map) return false;

        // Пытаемся получить существующий маркер по ID (PILOT обычно использует vehid как ID маркера)
        var marker = null;
        if (map.getMarker) {
            marker = map.getMarker(vehid);
        }
        if (marker && marker.setLatLng) {
            // Leaflet marker
            marker.setLatLng([lat, lon]);
            return true;
        } else if (map.addMarker) {
            // Если маркер не найден, удаляем старый (если есть) и добавляем новый
            if (map.removeMarker) {
                map.removeMarker(vehid);
            }
            map.addMarker({
                id: vehid,
                lat: lat,
                lon: lon,
                hint: 'Vehicle ' + vehid
            });
            return true;
        }
        return false;
    },

    /**
     * Публичный метод для внешнего вызова (например, из реального API датчиков).
     * @param {number|string} vehid
     * @param {string} sensorId
     */
    moveVehicleOnSensor: function(vehid, sensorId) {
        this.simulateTrigger(vehid, sensorId);
    }

});
