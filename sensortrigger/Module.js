/**
 * Sensor Trigger Extension for PILOT (исправленная версия)
 * 
 * Назначение: задавать точки на карте для датчиков и перемещать ТС при срабатывании.
 * Исправлены проблемы с отображением ТС и интерфейсом.
 */

Ext.define('Store.sensortrigger.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Проверка обязательных объектов
        if (!window.skeleton) {
            Ext.log.error('sensortrigger: skeleton not found');
            return;
        }
        if (!window.mapContainer && !window.getActiveTabMapContainer) {
            Ext.log.error('sensortrigger: map container not found');
            return;
        }

        // Инициализация переменных
        me.waitingForMapClick = false;
        me.pendingAddWindow = null;

        // Глобальная ссылка для внешних вызовов
        window.sensortriggerModule = me;

        // 1. Создаём левую навигационную вкладку (без зависимостей)
        me.createNavigationTab();

        // 2. Создаём главную панель (mainPanel) и связываем с вкладкой
        me.createMainPanel();

        // 3. Загружаем ТС из PILOT
        me.loadVehicles();

        // 4. Загружаем сохранённые точки триггера
        me.loadTriggerPoints();
        me.renderTriggerPointsOnMap();

        // 5. Настраиваем клик по карте для добавления координат
        me.setupMapClickListener();

        // 6. Создаём кнопку на карте для добавления точки (опционально)
        me.addMapButton();

        Ext.log('sensortrigger: extension initialized');
    },

    // ----------------------------------------------------------------------
    // ЛЕВАЯ ВКЛАДКА (без Pilot.utils.LeftBarPanel)
    // ----------------------------------------------------------------------
    createNavigationTab: function() {
        var me = this;

        // Создаём грид для списка ТС
        var vehicleGrid = Ext.create('Ext.grid.Panel', {
            title: 'Транспортные средства',
            store: Ext.create('Ext.data.Store', { fields: ['vehid', 'name', 'vin', 'model', 'year'] }),
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2 },
                { text: 'VIN', dataIndex: 'vin', flex: 2 },
                { text: 'Модель', dataIndex: 'model', flex: 1 },
                { text: 'Год', dataIndex: 'year', flex: 1, align: 'center' }
            ],
            listeners: {
                select: function(grid, record) {
                    // Показываем мок-датчики
                    var vehid = record.get('vehid');
                    var sensors = me.mockSensors ? me.mockSensors[vehid] : [];
                    var sensorStr = sensors.map(function(s) { return s.name + ' (' + s.sensor_id + ')'; }).join(', ');
                    Ext.Msg.show({
                        title: 'Датчики',
                        message: 'Датчики для ' + record.get('name') + ':\n' + (sensorStr || 'нет'),
                        buttons: Ext.Msg.OK,
                        icon: Ext.Msg.INFO
                    });
                }
            }
        });

        me.vehicleGrid = vehicleGrid;

        // Обычная панель-вкладка (не LeftBarPanel, чтобы избежать ошибок)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Sensor Triggers',
            iconCls: 'fa fa-microchip',
            layout: 'fit',
            items: [vehicleGrid]
        });

        // Добавляем вкладку в левую навигацию
        skeleton.navigation.add(navTab);
        me.navTab = navTab;
    },

    // ----------------------------------------------------------------------
    // ГЛАВНАЯ ПАНЕЛЬ (Pattern A: navTab.map_frame = mainPanel)
    // ----------------------------------------------------------------------
    createMainPanel: function() {
        var me = this;

        // Главная панель, которая будет отображаться в skeleton.mapframe
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            // Здесь можно разместить дополнительный UI, но карта уже есть в mapframe
            // Оставляем пустым, так как используем существующую карту из mapContainer
            html: '<div style="padding: 10px;">Используйте кнопку на карте или правую панель для добавления точек.</div>'
        });

        // Связываем вкладку с главной панелью (важно!)
        me.navTab.map_frame = mainPanel;

        // Добавляем панель в mapframe
        if (skeleton.mapframe) {
            skeleton.mapframe.add(mainPanel);
        } else {
            Ext.log.warn('sensortrigger: skeleton.mapframe not found, mainPanel not added');
        }

        me.mainPanel = mainPanel;
    },

    // ----------------------------------------------------------------------
    // ЗАГРУЗКА ТРАНСПОРТНЫХ СРЕДСТВ
    // ----------------------------------------------------------------------
    loadVehicles: function() {
        var me = this;

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                var vehicles = me.flattenVehicleTree(data);
                me.vehiclesStore = Ext.create('Ext.data.Store', {
                    fields: ['vehid', 'name', 'vin', 'model', 'year'],
                    data: vehicles
                });
                if (me.vehicleGrid) {
                    me.vehicleGrid.reconfigure(me.vehiclesStore);
                }
                // Генерация мок-датчиков
                me.mockSensors = {};
                vehicles.forEach(function(vehicle) {
                    me.mockSensors[vehicle.vehid] = me.generateMockSensors(vehicle.vehid);
                });
                Ext.log('sensortrigger: loaded ' + vehicles.length + ' vehicles');
                // Если нет ТС, показываем сообщение
                if (vehicles.length === 0) {
                    Ext.Msg.alert('Информация', 'Нет транспортных средств в системе.');
                }
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС. Проверьте соединение.');
            }
        });
    },

    flattenVehicleTree: function(nodes, result) {
        result = result || [];
        if (!Ext.isArray(nodes)) return result;
        Ext.Array.each(nodes, function(node) {
            if (node.vehid && node.vehid > 0) {
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

    generateMockSensors: function(vehid) {
        return [
            { sensor_id: 'engine_temp_' + vehid, name: 'Температура двигателя' },
            { sensor_id: 'fuel_level_' + vehid, name: 'Уровень топлива' },
            { sensor_id: 'door_status_' + vehid, name: 'Состояние двери' }
        ];
    },

    // ----------------------------------------------------------------------
    // ТОЧКИ ТРИГГЕРА (localStorage)
    // ----------------------------------------------------------------------
    loadTriggerPoints: function() {
        var me = this;
        me.triggerPointsStore = Ext.create('Ext.data.Store', {
            fields: ['sensorId', 'lat', 'lon', 'label'],
            data: []
        });
        var stored = localStorage.getItem('sensortrigger_points');
        if (stored) {
            try {
                var points = Ext.decode(stored);
                me.triggerPointsStore.loadData(points);
                Ext.log('sensortrigger: loaded ' + points.length + ' trigger points');
            } catch(e) {}
        }
        // Создаём правую панель управления после загрузки store
        me.createControlPanel();
    },

    saveTriggerPoints: function() {
        var data = [];
        this.triggerPointsStore.each(function(rec) {
            data.push(rec.getData());
        });
        localStorage.setItem('sensortrigger_points', Ext.encode(data));
    },

    addTriggerPoint: function(sensorId, lat, lon, label) {
        var me = this;
        var record = Ext.create('Ext.data.Model', {
            fields: ['sensorId', 'lat', 'lon', 'label'],
            data: { sensorId: sensorId, lat: lat, lon: lon, label: label || '' }
        });
        me.triggerPointsStore.add(record);
        me.saveTriggerPoints();
        me.addTriggerPointMarker(record);
        Ext.Msg.alert('Успех', 'Точка триггера добавлена');
    },

    deleteTriggerPoint: function(record) {
        var me = this;
        me.triggerPointsStore.remove(record);
        me.saveTriggerPoints();
        me.removeTriggerPointMarker(record.get('sensorId'));
    },

    renderTriggerPointsOnMap: function() {
        var me = this;
        me.triggerPointsStore.each(function(rec) {
            me.addTriggerPointMarker(rec);
        });
    },

    addTriggerPointMarker: function(record) {
        var map = this.getPilotMap();
        if (!map || !map.addMarker) return;
        map.addMarker({
            id: 'trigger_' + record.get('sensorId'),
            lat: record.get('lat'),
            lon: record.get('lon'),
            hint: record.get('label') || record.get('sensorId')
        });
    },

    removeTriggerPointMarker: function(sensorId) {
        var map = this.getPilotMap();
        if (map && map.removeMarker) {
            map.removeMarker('trigger_' + sensorId);
        }
    },

    // ----------------------------------------------------------------------
    // ПРАВАЯ ПАНЕЛЬ УПРАВЛЕНИЯ
    // ----------------------------------------------------------------------
    createControlPanel: function() {
        var me = this;

        // Хранилище для лога
        me.logStore = Ext.create('Ext.data.Store', {
            fields: ['timestamp', 'vehicleName', 'sensorId', 'targetLabel'],
            data: []
        });

        var pointsGrid = Ext.create('Ext.grid.Panel', {
            title: 'Точки триггеров',
            store: me.triggerPointsStore,
            columns: [
                { text: 'Sensor ID', dataIndex: 'sensorId', flex: 2 },
                { text: 'Метка', dataIndex: 'label', flex: 2 },
                { text: 'Координаты', flex: 1, renderer: function(v, m, rec) {
                    return rec.get('lat') + ', ' + rec.get('lon');
                }}
            ],
            height: 200,
            tbar: [{
                text: 'Добавить',
                iconCls: 'fa fa-plus',
                handler: function() { me.showAddTriggerWindow(); }
            }, {
                text: 'Удалить',
                iconCls: 'fa fa-trash',
                handler: function() {
                    var selected = pointsGrid.getSelectionModel().getSelection();
                    if (selected.length) me.deleteTriggerPoint(selected[0]);
                    else Ext.Msg.alert('Внимание', 'Выберите точку');
                }
            }],
            listeners: {
                select: function(grid, record) {
                    var map = me.getPilotMap();
                    if (map && map.setMapCenter) {
                        map.setMapCenter(record.get('lat'), record.get('lon'));
                        map.setMapZoom(15);
                    }
                }
            }
        });

        var logGrid = Ext.create('Ext.grid.Panel', {
            title: 'Журнал срабатываний',
            store: me.logStore,
            columns: [
                { text: 'Время', dataIndex: 'timestamp', width: 120 },
                { text: 'ТС', dataIndex: 'vehicleName', flex: 2 },
                { text: 'Sensor ID', dataIndex: 'sensorId', flex: 2 },
                { text: 'Точка', dataIndex: 'targetLabel', flex: 2 }
            ],
            height: 200
        });

        me.controlPanel = Ext.create('Ext.panel.Panel', {
            floating: true,
            width: 350,
            shadow: true,
            cls: 'sensortrigger-right-panel',
            layout: 'border',
            title: 'Управление датчиками',
            tools: [{ type: 'close', handler: function() { me.controlPanel.hide(); } }],
            items: [{
                region: 'north',
                xtype: 'toolbar',
                items: [{
                    text: 'Симуляция триггера',
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

        me.controlPanel.show();
        me.controlPanel.setPosition(document.documentElement.clientWidth - 360, 80);

        // Ресайз
        var resizeHandler = function() {
            if (me.controlPanel && me.controlPanel.isVisible()) {
                me.controlPanel.setPosition(document.documentElement.clientWidth - 360, 80);
            }
        };
        if (Ext.on) Ext.on('resize', resizeHandler);
        else window.addEventListener('resize', resizeHandler);
    },

    // ----------------------------------------------------------------------
    // КНОПКА НА КАРТЕ
    // ----------------------------------------------------------------------
    addMapButton: function() {
        var me = this;
        var map = me.getPilotMap();
        if (!map || !map.map) return;
        // Создаём простую HTML кнопку в углу карты (через DOM)
        var btn = document.createElement('button');
        btn.innerHTML = '➕ Добавить точку';
        btn.style.position = 'absolute';
        btn.style.top = '10px';
        btn.style.right = '10px';
        btn.style.zIndex = '1000';
        btn.style.padding = '8px 12px';
        btn.style.backgroundColor = '#3b82f6';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.onclick = function() { me.showAddTriggerWindow(); };
        // Находим контейнер карты
        var container = map.map._container || map.map.getContainer();
        if (container && container.parentNode) {
            container.parentNode.style.position = 'relative';
            container.parentNode.appendChild(btn);
        }
    },

    // ----------------------------------------------------------------------
    // ВЗАИМОДЕЙСТВИЕ С КАРТОЙ
    // ----------------------------------------------------------------------
    getPilotMap: function() {
        if (window.getActiveTabMapContainer) return getActiveTabMapContainer();
        return window.mapContainer || null;
    },

    setupMapClickListener: function() {
        var me = this;
        var map = me.getPilotMap();
        if (!map || !map.map) return;
        map.map.on('click', function(e) {
            if (me.waitingForMapClick) {
                var lat = e.latlng.lat;
                var lng = e.latlng.lng;
                if (me.pendingAddWindow) {
                    var latField = me.pendingAddWindow.down('textfield[itemId=latField]');
                    var lonField = me.pendingAddWindow.down('textfield[itemId=lonField]');
                    if (latField && lonField) {
                        latField.setValue(lat);
                        lonField.setValue(lng);
                    }
                }
                me.waitingForMapClick = false;
                Ext.Msg.alert('Готово', 'Координаты добавлены в форму');
            }
        });
    },

    showAddTriggerWindow: function() {
        var me = this;
        var win = Ext.create('Ext.window.Window', {
            title: 'Добавить точку триггера',
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
                fieldLabel: 'Метка (опционально)',
                itemId: 'labelField'
            }, {
                xtype: 'numberfield',
                fieldLabel: 'Широта',
                itemId: 'latField',
                step: 0.000001,
                allowBlank: false
            }, {
                xtype: 'numberfield',
                fieldLabel: 'Долгота',
                itemId: 'lonField',
                step: 0.000001,
                allowBlank: false
            }, {
                xtype: 'button',
                text: 'Выбрать на карте',
                handler: function() {
                    me.waitingForMapClick = true;
                    me.pendingAddWindow = win;
                    Ext.Msg.alert('Инструкция', 'Кликните на карте в нужном месте');
                }
            }],
            buttons: [{
                text: 'Сохранить',
                handler: function() {
                    var sensorId = win.down('#sensorIdField').getValue();
                    var lat = win.down('#latField').getValue();
                    var lon = win.down('#lonField').getValue();
                    var label = win.down('#labelField').getValue();
                    if (!sensorId || !lat || !lon) {
                        Ext.Msg.alert('Ошибка', 'Заполните Sensor ID, широту и долготу');
                        return;
                    }
                    me.addTriggerPoint(sensorId, lat, lon, label);
                    win.close();
                    me.waitingForMapClick = false;
                }
            }, {
                text: 'Отмена',
                handler: function() { win.close(); me.waitingForMapClick = false; }
            }]
        });
        win.show();
    },

    showSimulateWindow: function() {
        var me = this;
        if (!me.vehiclesStore || me.vehiclesStore.getCount() === 0) {
            Ext.Msg.alert('Ошибка', 'Список ТС ещё не загружен');
            return;
        }

        var vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: 'Транспортное средство',
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
            title: 'Симуляция срабатывания датчика',
            width: 400,
            modal: true,
            items: [vehicleCombo, sensorCombo],
            buttons: [{
                text: 'Симулировать',
                handler: function() {
                    var vehid = vehicleCombo.getValue();
                    var sensorId = sensorCombo.getValue();
                    if (!vehid || !sensorId) {
                        Ext.Msg.alert('Ошибка', 'Выберите ТС и Sensor ID');
                        return;
                    }
                    win.close();
                    me.simulateTrigger(vehid, sensorId);
                }
            }, {
                text: 'Отмена',
                handler: function() { win.close(); }
            }]
        });
        win.show();
    },

    simulateTrigger: function(vehid, sensorId) {
        var me = this;
        var triggerRecord = null;
        me.triggerPointsStore.each(function(rec) {
            if (rec.get('sensorId') === sensorId) {
                triggerRecord = rec;
                return false;
            }
        });
        if (!triggerRecord) {
            Ext.Msg.alert('Нет точки', 'Для Sensor ID "' + sensorId + '" не задана точка триггера');
            return;
        }

        var vehicleRecord = me.vehiclesStore.findRecord('vehid', vehid);
        var vehicleName = vehicleRecord ? vehicleRecord.get('name') : 'ID:' + vehid;

        var success = me.moveVehicleMarker(vehid, triggerRecord.get('lat'), triggerRecord.get('lon'));
        if (success) {
            me.logStore.add({
                timestamp: Ext.Date.format(new Date(), 'Y-m-d H:i:s'),
                vehicleName: vehicleName,
                sensorId: sensorId,
                targetLabel: triggerRecord.get('label') || sensorId
            });
            Ext.Msg.alert('Триггер', 'ТС "' + vehicleName + '" перемещён в точку "' + (triggerRecord.get('label') || sensorId) + '"');
        } else {
            Ext.Msg.alert('Ошибка', 'Не удалось найти маркер ТС на карте');
        }
    },

    moveVehicleMarker: function(vehid, lat, lon) {
        var map = this.getPilotMap();
        if (!map) return false;
        var marker = map.getMarker ? map.getMarker(vehid) : null;
        if (marker && marker.setLatLng) {
            marker.setLatLng([lat, lon]);
            return true;
        } else if (map.addMarker) {
            if (map.removeMarker) map.removeMarker(vehid);
            map.addMarker({ id: vehid, lat: lat, lon: lon, hint: 'Vehicle ' + vehid });
            return true;
        }
        return false;
    },

    moveVehicleOnSensor: function(vehid, sensorId) {
        this.simulateTrigger(vehid, sensorId);
    }
});
