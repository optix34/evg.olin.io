/**
 * Sensor Trigger Extension – "Позиция по меткам"
 * Исправлено: отображение ТС, название вкладки, парсинг дерева.
 */

Ext.define('Store.sensortrigger.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        console.log('[sensortrigger] initModule started');

        if (!window.skeleton) {
            console.error('[sensortrigger] skeleton not found');
            return;
        }

        me.waitForMap(function() {
            console.log('[sensortrigger] map ready');
            me.createNavigationTab();
            me.loadVehicles();
            me.loadTriggerPoints();
            me.createControlPanel();
            me.addMapButton();
            me.setupMapClickListener();
        });
    },

    // Ожидание карты
    waitForMap: function(callback) {
        var check = function() {
            var map = window.mapContainer || (window.getActiveTabMapContainer && window.getActiveTabMapContainer());
            if (map && map.map) {
                callback();
            } else {
                console.log('[sensortrigger] waiting for map...');
                setTimeout(check, 500);
            }
        };
        check();
    },

    // ----------------------------------------------------------------------
    // ЛЕВАЯ ВКЛАДКА С НОВЫМ НАЗВАНИЕМ
    // ----------------------------------------------------------------------
    createNavigationTab: function() {
        var me = this;

        me.vehicleGrid = Ext.create('Ext.grid.Panel', {
            title: 'Транспорт',
            store: Ext.create('Ext.data.Store', {
                fields: ['vehid', 'name', 'vin', 'model', 'year']
            }),
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2 },
                { text: 'VIN', dataIndex: 'vin', flex: 2 },
                { text: 'Модель', dataIndex: 'model', flex: 1 },
                { text: 'Год', dataIndex: 'year', flex: 1 }
            ],
            listeners: {
                select: function(grid, record) {
                    var vehid = record.get('vehid');
                    var sensors = me.mockSensors ? me.mockSensors[vehid] : [];
                    var msg = sensors.map(s => s.name + ' (' + s.sensor_id + ')').join('\n');
                    Ext.Msg.alert('Датчики', msg || 'Нет датчиков');
                }
            }
        });

        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Позиция по меткам',          // ← ИЗМЕНЕНО НАЗВАНИЕ
            iconCls: 'fa fa-microchip',
            layout: 'fit',
            items: [me.vehicleGrid]
        });

        if (skeleton.navigation) {
            skeleton.navigation.add(navTab);
            console.log('[sensortrigger] navigation tab added');
        } else {
            console.error('[sensortrigger] skeleton.navigation missing');
        }
    },

    // ----------------------------------------------------------------------
    // ЗАГРУЗКА ТС С УЛУЧШЕННЫМ ПАРСИНГОМ
    // ----------------------------------------------------------------------
    loadVehicles: function() {
        var me = this;

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                console.log('[sensortrigger] /ax/tree.php response status:', response.status);
                var rawData;
                try {
                    rawData = Ext.decode(response.responseText);
                    console.log('[sensortrigger] raw data sample:', JSON.stringify(rawData).substring(0, 500));
                } catch(e) {
                    console.error('[sensortrigger] JSON decode error', e);
                    Ext.Msg.alert('Ошибка', 'Не удалось разобрать ответ сервера');
                    return;
                }

                var vehicles = me.flattenVehicleTreeImproved(rawData);
                console.log('[sensortrigger] parsed vehicles count:', vehicles.length);

                if (vehicles.length === 0) {
                    // Покажем предупреждение с примером данных для диагностики
                    Ext.Msg.alert('Внимание', 'Не найдено транспортных средств. Убедитесь, что в системе есть ТС.\nОтвет сервера: ' + JSON.stringify(rawData).substring(0, 200));
                    return;
                }

                me.vehiclesStore = Ext.create('Ext.data.Store', {
                    fields: ['vehid', 'name', 'vin', 'model', 'year'],
                    data: vehicles
                });
                if (me.vehicleGrid) {
                    me.vehicleGrid.reconfigure(me.vehiclesStore);
                }

                // Генерация мок-датчиков
                me.mockSensors = {};
                vehicles.forEach(function(v) {
                    me.mockSensors[v.vehid] = [
                        { sensor_id: 'engine_temp_' + v.vehid, name: 'Температура двигателя' },
                        { sensor_id: 'fuel_level_' + v.vehid, name: 'Уровень топлива' },
                        { sensor_id: 'door_status_' + v.vehid, name: 'Состояние двери' }
                    ];
                });
            },
            failure: function(response) {
                console.error('[sensortrigger] /ax/tree.php failed', response);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить ТС. Код: ' + response.status);
            }
        });
    },

    // Улучшенный парсинг дерева (поддерживает разные форматы)
    flattenVehicleTreeImproved: function(nodes, result) {
        result = result || [];
        if (!nodes) return result;
        if (!Ext.isArray(nodes)) nodes = [nodes];

        Ext.Array.each(nodes, function(node) {
            // Проверяем, является ли узел транспортным средством
            // В PILOT vehid > 0 и обычно есть поле name
            if (node.vehid && parseInt(node.vehid) > 0) {
                result.push({
                    vehid: node.vehid,
                    name: node.name || 'Без имени',
                    vin: node.vin || '',
                    model: node.model || '',
                    year: node.year || ''
                });
            }
            // Рекурсивно обходим дочерние элементы (поле может называться children, items, nodes)
            var children = node.children || node.items || node.nodes || [];
            if (children.length) {
                this.flattenVehicleTreeImproved(children, result);
            }
        }, this);
        return result;
    },

    // ----------------------------------------------------------------------
    // ТОЧКИ ТРИГГЕРА (без изменений, работают)
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
                console.log('[sensortrigger] loaded', points.length, 'trigger points');
            } catch(e) {}
        }
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

    addTriggerPointMarker: function(record) {
        var map = this.getMap();
        if (!map || !map.addMarker) return;
        map.addMarker({
            id: 'trigger_' + record.get('sensorId'),
            lat: record.get('lat'),
            lon: record.get('lon'),
            hint: record.get('label') || record.get('sensorId')
        });
    },

    removeTriggerPointMarker: function(sensorId) {
        var map = this.getMap();
        if (map && map.removeMarker) {
            map.removeMarker('trigger_' + sensorId);
        }
    },

    // ----------------------------------------------------------------------
    // ПРАВАЯ ПАНЕЛЬ УПРАВЛЕНИЯ
    // ----------------------------------------------------------------------
    createControlPanel: function() {
        var me = this;

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
                    var map = me.getMap();
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

        var resizeHandler = function() {
            if (me.controlPanel && me.controlPanel.isVisible()) {
                me.controlPanel.setPosition(document.documentElement.clientWidth - 360, 80);
            }
        };
        if (Ext.on) Ext.on('resize', resizeHandler);
        else window.addEventListener('resize', resizeHandler);
    },

    // Кнопка на карте
    addMapButton: function() {
        var me = this;
        var map = me.getMap();
        if (!map || !map.map) {
            console.error('[sensortrigger] cannot add map button – map not ready');
            return;
        }

        var btn = document.createElement('button');
        btn.innerHTML = '➕ Добавить точку триггера';
        btn.style.position = 'absolute';
        btn.style.bottom = '20px';
        btn.style.right = '20px';
        btn.style.zIndex = '1000';
        btn.style.padding = '10px 15px';
        btn.style.backgroundColor = '#3b82f6';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        btn.onclick = function() { me.showAddTriggerWindow(); };

        var container = map.map._container || map.map.getContainer();
        if (container && container.parentNode) {
            container.parentNode.style.position = 'relative';
            container.parentNode.appendChild(btn);
        }
    },

    getMap: function() {
        if (window.getActiveTabMapContainer) return getActiveTabMapContainer();
        return window.mapContainer || null;
    },

    setupMapClickListener: function() {
        var me = this;
        var map = me.getMap();
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
                Ext.Msg.alert('Готово', 'Координаты добавлены');
            }
        });
    },

    showAddTriggerWindow: function() {
        var me = this;
        var win = Ext.create('Ext.window.Window', {
            title: 'Новая точка триггера',
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
                        Ext.Msg.alert('Ошибка', 'Заполните все поля');
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
            fieldLabel: 'Транспорт',
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
            title: 'Симуляция срабатывания',
            width: 400,
            modal: true,
            items: [vehicleCombo, sensorCombo],
            buttons: [{
                text: 'Симулировать',
                handler: function() {
                    var vehid = vehicleCombo.getValue();
                    var sensorId = sensorCombo.getValue();
                    if (!vehid || !sensorId) {
                        Ext.Msg.alert('Ошибка', 'Выберите ТС и датчик');
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
            Ext.Msg.alert('Нет точки', 'Для датчика ' + sensorId + ' не задана точка');
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
            Ext.Msg.alert('Триггер', 'ТС ' + vehicleName + ' перемещён');
        } else {
            Ext.Msg.alert('Ошибка', 'Маркер ТС не найден');
        }
    },

    moveVehicleMarker: function(vehid, lat, lon) {
        var map = this.getMap();
        if (!map) return false;
        var marker = map.getMarker ? map.getMarker(vehid) : null;
        if (marker && marker.setLatLng) {
            marker.setLatLng([lat, lon]);
            return true;
        } else if (map.addMarker) {
            if (map.removeMarker) map.removeMarker(vehid);
            map.addMarker({ id: vehid, lat: lat, lon: lon, hint: 'Vehicle' });
            return true;
        }
        return false;
    }
});
