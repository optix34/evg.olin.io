/**
 * Sensor Trigger Extension – версия с кнопкой в левом нижнем углу
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
            me.createNavigationTab();
            me.loadVehicles();
            me.loadTriggerPoints();
            me.createControlPanel();
            me.addMapButton();
            me.setupMapClickListener();
        });
    },

    waitForMap: function(callback) {
        var check = function() {
            var map = window.mapContainer || window.getActiveTabMapContainer?.();
            if (map && map.map) callback();
            else { console.log('[sensortrigger] waiting for map...'); setTimeout(check, 500); }
        };
        check();
    },

    createNavigationTab: function() {
        var me = this;
        me.vehicleGrid = Ext.create('Ext.grid.Panel', {
            title: 'Транспорт',
            store: Ext.create('Ext.data.Store', { fields: ['vehid', 'name', 'vin', 'model', 'year'] }),
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2 },
                { text: 'VIN', dataIndex: 'vin', flex: 2 },
                { text: 'Модель', dataIndex: 'model', flex: 1 },
                { text: 'Год', dataIndex: 'year', flex: 1 }
            ],
            listeners: {
                select: function(grid, record) {
                    var sensors = me.mockSensors ? me.mockSensors[record.get('vehid')] : [];
                    Ext.Msg.alert('Датчики', sensors.map(s => s.name + ' (' + s.sensor_id + ')').join('\n') || 'Нет датчиков');
                }
            }
        });
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Позиция по меткам',
            iconCls: 'fa fa-microchip',
            layout: 'fit',
            items: [me.vehicleGrid]
        });
        if (skeleton.navigation) skeleton.navigation.add(navTab);
    },

    loadVehicles: function() {
        var me = this;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                var vehicles = me.flattenVehicleTree(Ext.decode(response.responseText));
                me.vehiclesStore = Ext.create('Ext.data.Store', { fields: ['vehid', 'name', 'vin', 'model', 'year'], data: vehicles });
                if (me.vehicleGrid) me.vehicleGrid.reconfigure(me.vehiclesStore);
                me.mockSensors = {};
                vehicles.forEach(v => {
                    me.mockSensors[v.vehid] = [
                        { sensor_id: 'engine_temp_' + v.vehid, name: 'Температура двигателя' },
                        { sensor_id: 'fuel_level_' + v.vehid, name: 'Уровень топлива' },
                        { sensor_id: 'door_status_' + v.vehid, name: 'Состояние двери' }
                    ];
                });
                if (!vehicles.length) Ext.Msg.alert('Информация', 'Нет объектов клиента');
            },
            failure: () => Ext.Msg.alert('Ошибка', 'Не удалось загрузить объекты клиента')
        });
    },

    flattenVehicleTree: function(nodes, result) {
        result = result || [];
        if (!Ext.isArray(nodes)) return result;
        Ext.Array.each(nodes, node => {
            if (node.vehid && node.vehid > 0) result.push({ vehid: node.vehid, name: node.name || 'N/A', vin: node.vin || '', model: node.model || '', year: node.year || '' });
            if (node.children?.length) this.flattenVehicleTree(node.children, result);
        }, this);
        return result;
    },

    loadTriggerPoints: function() {
        var me = this;
        me.triggerPointsStore = Ext.create('Ext.data.Store', { fields: ['sensorId', 'lat', 'lon', 'label'], data: [] });
        var stored = localStorage.getItem('sensortrigger_points');
        if (stored) try { me.triggerPointsStore.loadData(Ext.decode(stored)); } catch(e) {}
    },

    saveTriggerPoints: function() {
        var data = [];
        this.triggerPointsStore.each(rec => data.push(rec.getData()));
        localStorage.setItem('sensortrigger_points', Ext.encode(data));
    },

    addTriggerPoint: function(sensorId, lat, lon, label) {
        var me = this, rec = Ext.create('Ext.data.Model', { fields: ['sensorId', 'lat', 'lon', 'label'], data: { sensorId, lat, lon, label: label || '' } });
        me.triggerPointsStore.add(rec);
        me.saveTriggerPoints();
        me.addTriggerPointMarker(rec);
        Ext.Msg.alert('Успех', 'Точка добавлена');
    },

    deleteTriggerPoint: function(record) {
        this.triggerPointsStore.remove(record);
        this.saveTriggerPoints();
        this.removeTriggerPointMarker(record.get('sensorId'));
    },

    addTriggerPointMarker: function(record) {
        var map = this.getMap();
        if (map?.addMarker) map.addMarker({ id: 'trigger_' + record.get('sensorId'), lat: record.get('lat'), lon: record.get('lon'), hint: record.get('label') || record.get('sensorId') });
    },

    removeTriggerPointMarker: function(sensorId) {
        var map = this.getMap();
        if (map?.removeMarker) map.removeMarker('trigger_' + sensorId);
    },

    createControlPanel: function() {
        var me = this;
        me.logStore = Ext.create('Ext.data.Store', { fields: ['timestamp', 'vehicleName', 'sensorId', 'targetLabel'], data: [] });
        var pointsGrid = Ext.create('Ext.grid.Panel', {
            title: 'Точки привязки', store: me.triggerPointsStore,
            columns: [
                { text: 'Метка (ID)', dataIndex: 'sensorId', flex: 2 },
                { text: 'Описание', dataIndex: 'label', flex: 2 },
                { text: 'Координаты', flex: 1, renderer: (v,m,rec) => rec.get('lat') + ', ' + rec.get('lon') }
            ],
            height: 200,
            tbar: [
                { text: 'Добавить', iconCls: 'fa fa-plus', handler: () => me.showAddTriggerWindow() },
                { text: 'Удалить', iconCls: 'fa fa-trash', handler: () => { let s = pointsGrid.getSelectionModel().getSelection(); if(s.length) me.deleteTriggerPoint(s[0]); else Ext.Msg.alert('Внимание','Выберите точку'); } }
            ],
            listeners: { select: (grid,rec) => { let map = me.getMap(); if(map?.setMapCenter) { map.setMapCenter(rec.get('lat'), rec.get('lon')); map.setMapZoom(15); } } }
        });
        var logGrid = Ext.create('Ext.grid.Panel', {
            title: 'Журнал перемещений', store: me.logStore,
            columns: [
                { text: 'Время', dataIndex: 'timestamp', width: 120 },
                { text: 'Объект', dataIndex: 'vehicleName', flex: 2 },
                { text: 'Метка', dataIndex: 'sensorId', flex: 2 },
                { text: 'Точка', dataIndex: 'targetLabel', flex: 2 }
            ], height: 200
        });
        me.controlPanel = Ext.create('Ext.panel.Panel', {
            floating: true, width: 350, shadow: true, layout: 'border', title: 'Управление позициями по меткам',
            tools: [{ type: 'close', handler: () => me.controlPanel.hide() }],
            items: [
                { region: 'north', xtype: 'toolbar', items: [{ text: 'Симуляция срабатывания', iconCls: 'fa fa-bolt', handler: () => me.showSimulateWindow() }] },
                { region: 'center', layout: 'fit', items: [pointsGrid] },
                { region: 'south', height: 220, layout: 'fit', items: [logGrid] }
            ]
        });
        me.controlPanel.show();
        me.controlPanel.setPosition(document.documentElement.clientWidth - 360, 80);
        let resizeHandler = () => { if(me.controlPanel?.isVisible()) me.controlPanel.setPosition(document.documentElement.clientWidth - 360, 80); };
        if(Ext.on) Ext.on('resize', resizeHandler); else window.addEventListener('resize', resizeHandler);
    },

    // КНОПКА В НИЖНЕМ ЛЕВОМ УГЛУ (изменено)
    addMapButton: function() {
        var me = this;
        var map = me.getMap();
        if (!map || !map.map) { console.error('[sensortrigger] cannot add map button'); return; }
        var btn = document.createElement('button');
        btn.innerHTML = '➕ Добавить точку привязки';
        btn.style.position = 'absolute';
        btn.style.bottom = '20px';
        btn.style.left = '20px';   // <-- нижний левый угол
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
            console.log('[sensortrigger] map button added at bottom-left');
        } else console.error('[sensortrigger] cannot find map container');
    },

    getMap: function() { return window.getActiveTabMapContainer?.() || window.mapContainer || null; },

    setupMapClickListener: function() {
        var me = this;
        var map = me.getMap();
        if (!map?.map) return;
        map.map.on('click', function(e) {
            if (me.waitingForMapClick && me.pendingAddWindow) {
                let lat = e.latlng.lat, lng = e.latlng.lng;
                let latField = me.pendingAddWindow.down('textfield[itemId=latField]');
                let lonField = me.pendingAddWindow.down('textfield[itemId=lonField]');
                if (latField && lonField) { latField.setValue(lat); lonField.setValue(lng); }
                me.waitingForMapClick = false;
                Ext.Msg.alert('Готово', 'Координаты добавлены');
            }
        });
    },

    showAddTriggerWindow: function() {
        var me = this;
        var win = Ext.create('Ext.window.Window', {
            title: 'Новая точка привязки', width: 400, modal: true, layout: 'anchor',
            defaults: { anchor: '100%', margin: '5 10' },
            items: [
                { xtype: 'textfield', fieldLabel: 'Метка (ID)', itemId: 'sensorIdField', allowBlank: false },
                { xtype: 'textfield', fieldLabel: 'Описание (необязательно)', itemId: 'labelField' },
                { xtype: 'numberfield', fieldLabel: 'Широта', itemId: 'latField', step: 0.000001, allowBlank: false },
                { xtype: 'numberfield', fieldLabel: 'Долгота', itemId: 'lonField', step: 0.000001, allowBlank: false },
                { xtype: 'button', text: 'Выбрать на карте', handler: () => { me.waitingForMapClick = true; me.pendingAddWindow = win; Ext.Msg.alert('Инструкция','Кликните на карте'); } }
            ],
            buttons: [
                { text: 'Сохранить', handler: () => {
                    let sensorId = win.down('#sensorIdField').getValue();
                    let lat = win.down('#latField').getValue();
                    let lon = win.down('#lonField').getValue();
                    let label = win.down('#labelField').getValue();
                    if (!sensorId || !lat || !lon) { Ext.Msg.alert('Ошибка','Заполните метку и координаты'); return; }
                    me.addTriggerPoint(sensorId, lat, lon, label);
                    win.close(); me.waitingForMapClick = false;
                } },
                { text: 'Отмена', handler: () => { win.close(); me.waitingForMapClick = false; } }
            ]
        });
        win.show();
    },

    showSimulateWindow: function() {
        var me = this;
        if (!me.vehiclesStore || me.vehiclesStore.getCount() === 0) { Ext.Msg.alert('Ошибка','Список объектов не загружен'); return; }
        var vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: 'Объект', store: me.vehiclesStore, displayField: 'name', valueField: 'vehid', queryMode: 'local', allowBlank: false,
            listeners: { select: (combo, records) => { let sensors = me.mockSensors[records[0].get('vehid')] || []; sensorCombo.store.loadData(sensors); sensorCombo.setValue(null); } }
        });
        var sensorCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: 'Метка (ID)', store: Ext.create('Ext.data.Store', { fields: ['sensor_id', 'name'] }), displayField: 'name', valueField: 'sensor_id', queryMode: 'local', allowBlank: false
        });
        var win = Ext.create('Ext.window.Window', {
            title: 'Симуляция срабатывания метки', width: 400, modal: true,
            items: [vehicleCombo, sensorCombo],
            buttons: [
                { text: 'Переместить', handler: () => {
                    let vehid = vehicleCombo.getValue(), sensorId = sensorCombo.getValue();
                    if (!vehid || !sensorId) { Ext.Msg.alert('Ошибка','Выберите объект и метку'); return; }
                    win.close(); me.simulateTrigger(vehid, sensorId);
                } },
                { text: 'Отмена', handler: () => win.close() }
            ]
        });
        win.show();
    },

    simulateTrigger: function(vehid, sensorId) {
        var me = this;
        var triggerRecord = null;
        me.triggerPointsStore.each(rec => { if(rec.get('sensorId') === sensorId) { triggerRecord = rec; return false; } });
        if (!triggerRecord) { Ext.Msg.alert('Нет точки', 'Для метки "' + sensorId + '" не задана точка привязки'); return; }
        var vehicleRecord = me.vehiclesStore.findRecord('vehid', vehid);
        var vehicleName = vehicleRecord ? vehicleRecord.get('name') : 'ID:' + vehid;
        var success = me.moveVehicleMarker(vehid, triggerRecord.get('lat'), triggerRecord.get('lon'));
        if (success) {
            me.logStore.add({ timestamp: Ext.Date.format(new Date(), 'Y-m-d H:i:s'), vehicleName, sensorId, targetLabel: triggerRecord.get('label') || sensorId });
            Ext.Msg.alert('Перемещение', 'Объект "' + vehicleName + '" перемещён в точку "' + (triggerRecord.get('label') || sensorId) + '"');
        } else Ext.Msg.alert('Ошибка', 'Не удалось найти маркер объекта на карте');
    },

    moveVehicleMarker: function(vehid, lat, lon) {
        var map = this.getMap();
        if (!map) return false;
        var marker = map.getMarker ? map.getMarker(vehid) : null;
        if (marker && marker.setLatLng) { marker.setLatLng([lat, lon]); return true; }
        else if (map.addMarker) { if(map.removeMarker) map.removeMarker(vehid); map.addMarker({ id: vehid, lat, lon, hint: 'Vehicle' }); return true; }
        return false;
    }
});
