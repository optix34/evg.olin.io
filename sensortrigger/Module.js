/**
 * Позиция по меткам – финальная стабильная версия
 */
Ext.define('Store.sensortrigger.Module', {
    extend: 'Ext.Component',

    triggerMarkers: {},

    initModule: function() {
        var me = this;
        console.log('[sensortrigger] initModule started');

        if (!window.skeleton) {
            console.error('[sensortrigger] skeleton not found');
            return;
        }

        me.waitForMap(function() {
            console.log('[sensortrigger] map is ready');
            me.createNavigationTab();
            me.loadVehicles();
            me.loadTriggerPoints();
            me.createControlPanel();
            me.setupMapClickListener();
            me.addMapButton();        // теперь кнопка точно появится
        });
    },

    waitForMap: function(callback) {
        var me = this;
        var check = function() {
            var map = window.mapContainer || (window.getActiveTabMapContainer ? getActiveTabMapContainer() : null);
            if (map && map.map && map.map.getContainer) {
                setTimeout(callback, 200);
            } else {
                console.log('[sensortrigger] waiting for map...');
                setTimeout(check, 500);
            }
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
                    var vehid = record.get('vehid');
                    var sensors = me.mockSensors ? me.mockSensors[vehid] : [];
                    var msg = sensors.map(s => s.name + ' (' + s.sensor_id + ')').join('\n');
                    Ext.Msg.alert('Датчики', msg || 'Нет датчиков');
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
                var data = Ext.decode(response.responseText);
                var vehicles = me.flattenVehicleTree(data);
                me.vehiclesStore = Ext.create('Ext.data.Store', { fields: ['vehid', 'name', 'vin', 'model', 'year'], data: vehicles });
                if (me.vehicleGrid) me.vehicleGrid.reconfigure(me.vehiclesStore);
                me.mockSensors = {};
                vehicles.forEach(function(v) {
                    me.mockSensors[v.vehid] = [
                        { sensor_id: 'engine_temp_' + v.vehid, name: 'Температура двигателя' },
                        { sensor_id: 'fuel_level_' + v.vehid, name: 'Уровень топлива' },
                        { sensor_id: 'door_status_' + v.vehid, name: 'Состояние двери' }
                    ];
                });
                if (vehicles.length === 0) Ext.Msg.alert('Информация', 'Нет объектов клиента');
            },
            failure: function() { Ext.Msg.alert('Ошибка', 'Не удалось загрузить объекты'); }
        });
    },

    flattenVehicleTree: function(nodes, result) {
        result = result || [];
        if (!Ext.isArray(nodes)) return result;
        Ext.Array.each(nodes, function(node) {
            if (node.vehid && node.vehid > 0) {
                result.push({ vehid: node.vehid, name: node.name || 'N/A', vin: node.vin || '', model: node.model || '', year: node.year || '' });
            }
            if (node.children && node.children.length) this.flattenVehicleTree(node.children, result);
        }, this);
        return result;
    },

    loadTriggerPoints: function() {
        var me = this;
        me.triggerPointsStore = Ext.create('Ext.data.Store', { fields: ['sensorId', 'lat', 'lon', 'label'], data: [] });
        var stored = localStorage.getItem('sensortrigger_points');
        if (stored) {
            try { me.triggerPointsStore.loadData(Ext.decode(stored)); } catch(e) {}
        }
        me.renderAllTriggerMarkers();
    },

    saveTriggerPoints: function() {
        var data = [];
        this.triggerPointsStore.each(function(rec) { data.push(rec.getData()); });
        localStorage.setItem('sensortrigger_points', Ext.encode(data));
    },

    addTriggerPoint: function(sensorId, lat, lon, label) {
        var me = this;
        var record = Ext.create('Ext.data.Model', { fields: ['sensorId', 'lat', 'lon', 'label'], data: { sensorId: sensorId, lat: lat, lon: lon, label: label || '' } });
        me.triggerPointsStore.add(record);
        me.saveTriggerPoints();
        me.addTriggerPointMarker(record);
        Ext.Msg.alert('Успех', 'Точка добавлена и отмечена на карте');
    },

    deleteTriggerPoint: function(record) {
        var me = this;
        var sensorId = record.get('sensorId');
        me.triggerPointsStore.remove(record);
        me.saveTriggerPoints();
        me.removeTriggerPointMarker(sensorId);
    },

    addTriggerPointMarker: function(record) {
        var me = this, map = me.getMap();
        if (!map || !map.map) return;
        var sensorId = record.get('sensorId'), lat = record.get('lat'), lon = record.get('lon'), label = record.get('label') || sensorId;
        var iconHtml = '<i class="fa fa-podcast" style="font-size: 24px; color: #7c3aed; text-shadow: 1px 1px 1px white;"></i>';
        var customIcon = L.divIcon({ html: iconHtml, className: 'sensortrigger-marker-icon', iconSize: [24, 24], popupAnchor: [0, -12] });
        var marker = L.marker([lat, lon], { icon: customIcon });
        marker.bindPopup('<b>' + Ext.String.htmlEncode(label) + '</b><br>ID: ' + Ext.String.htmlEncode(sensorId));
        marker.addTo(map.map);
        me.triggerMarkers[sensorId] = marker;
    },

    removeTriggerPointMarker: function(sensorId) {
        if (this.triggerMarkers[sensorId]) { this.triggerMarkers[sensorId].remove(); delete this.triggerMarkers[sensorId]; }
    },

    renderAllTriggerMarkers: function() {
        var me = this;
        for (var id in me.triggerMarkers) { if (me.triggerMarkers.hasOwnProperty(id)) me.triggerMarkers[id].remove(); }
        me.triggerMarkers = {};
        me.triggerPointsStore.each(function(rec) { me.addTriggerPointMarker(rec); });
    },

    createControlPanel: function() {
        var me = this;
        me.logStore = Ext.create('Ext.data.Store', { fields: ['timestamp', 'vehicleName', 'sensorId', 'targetLabel'], data: [] });
        var pointsGrid = Ext.create('Ext.grid.Panel', {
            title: 'Точки привязки', store: me.triggerPointsStore,
            columns: [
                { text: 'Метка (ID)', dataIndex: 'sensorId', flex: 2 },
                { text: 'Описание', dataIndex: 'label', flex: 2 },
                { text: 'Координаты', flex: 1, renderer: function(v,m,rec) { return rec.get('lat')+', '+rec.get('lon'); } }
            ],
            height: 200,
            tbar: [
                { text: 'Добавить', iconCls: 'fa fa-plus', handler: function() { me.startPointSelection(); } },
                { text: 'Удалить', iconCls: 'fa fa-trash', handler: function() { var sel = pointsGrid.getSelectionModel().getSelection(); if(sel.length) me.deleteTriggerPoint(sel[0]); else Ext.Msg.alert('Внимание','Выберите точку'); } }
            ],
            listeners: { select: function(grid,record) { var map=me.getMap(); if(map&&map.setMapCenter) { map.setMapCenter(record.get('lat'),record.get('lon')); map.setMapZoom(15); } } }
        });
        var logGrid = Ext.create('Ext.grid.Panel', { title: 'Журнал перемещений', store: me.logStore, columns: [{ text:'Время',dataIndex:'timestamp',width:120},{ text:'Объект',dataIndex:'vehicleName',flex:2},{ text:'Метка',dataIndex:'sensorId',flex:2},{ text:'Точка',dataIndex:'targetLabel',flex:2}], height:200 });
        me.controlPanel = Ext.create('Ext.panel.Panel', {
            floating: true, width: 350, shadow: true, layout: 'border', title: 'Управление позициями по меткам',
            tools: [{ type: 'close', handler: function() { me.controlPanel.hide(); } }],
            items: [{ region: 'north', xtype: 'toolbar', items: [{ text: 'Симуляция срабатывания', iconCls: 'fa fa-bolt', handler: function() { me.showSimulateWindow(); } }] }, { region: 'center', layout: 'fit', items: [pointsGrid] }, { region: 'south', height: 220, layout: 'fit', items: [logGrid] }]
        });
        me.controlPanel.show();
        me.controlPanel.setPosition(document.documentElement.clientWidth - 360, 80);
        var resizeHandler = function() { if(me.controlPanel && me.controlPanel.isVisible()) me.controlPanel.setPosition(document.documentElement.clientWidth - 360, 80); };
        if(Ext.on) Ext.on('resize', resizeHandler); else window.addEventListener('resize', resizeHandler);
    },

    addMapButton: function() {
        var me = this;
        var map = me.getMap();
        if (!map || !map.map || !map.map.getContainer) {
            console.error('[sensortrigger] map not ready, retrying in 1s');
            setTimeout(function() { me.addMapButton(); }, 1000);
            return;
        }
        var container = map.map.getContainer();
        if (!container || !container.parentNode) {
            setTimeout(function() { me.addMapButton(); }, 1000);
            return;
        }
        if (document.getElementById('sensortrigger-map-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'sensortrigger-map-btn';
        btn.innerHTML = '➕ Добавить точку привязки';
        btn.style.cssText = 'position:absolute; bottom:20px; left:20px; z-index:1000; padding:10px 15px; background:#3b82f6; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.3);';
        btn.onclick = function() { me.startPointSelection(); };
        container.parentNode.style.position = 'relative';
        container.parentNode.appendChild(btn);
        console.log('[sensortrigger] map button added');
    },

    startPointSelection: function() {
        if (this.waitingForMapClick) { Ext.Msg.alert('Внимание', 'Уже ожидается выбор точки'); return; }
        this.waitingForMapClick = true;
        Ext.Msg.alert('Выбор точки', 'Кликните на карте в нужном месте');
    },

    setupMapClickListener: function() {
        var me = this, map = me.getMap();
        if (!map || !map.map) return;
        map.map.on('click', function(e) {
            if (me.waitingForMapClick) {
                me.waitingForMapClick = false;
                me.showAddTriggerWindowWithCoords(e.latlng.lat, e.latlng.lng);
            }
        });
    },

    showAddTriggerWindowWithCoords: function(lat, lon) {
        var me = this;
        var win = Ext.create('Ext.window.Window', {
            title: 'Новая точка привязки', width: 400, modal: true, layout: 'anchor', defaults: { anchor: '100%', margin: '5 10' },
            items: [
                { xtype: 'textfield', fieldLabel: 'Метка (ID)', itemId: 'sensorIdField', allowBlank: false },
                { xtype: 'textfield', fieldLabel: 'Описание (необязательно)', itemId: 'labelField' },
                { xtype: 'numberfield', fieldLabel: 'Широта', itemId: 'latField', value: lat, step: 0.000001, allowBlank: false },
                { xtype: 'numberfield', fieldLabel: 'Долгота', itemId: 'lonField', value: lon, step: 0.000001, allowBlank: false }
            ],
            buttons: [
                { text: 'Сохранить', handler: function() { var sid = win.down('#sensorIdField').getValue(), newLat = win.down('#latField').getValue(), newLon = win.down('#lonField').getValue(), lbl = win.down('#labelField').getValue(); if(!sid || !newLat || !newLon) { Ext.Msg.alert('Ошибка','Заполните метку и координаты'); return; } me.addTriggerPoint(sid, newLat, newLon, lbl); win.close(); } },
                { text: 'Отмена', handler: function() { win.close(); } }
            ]
        });
        win.show();
    },

    showSimulateWindow: function() {
        var me = this;
        if (!me.vehiclesStore || me.vehiclesStore.getCount() === 0) { Ext.Msg.alert('Ошибка', 'Список объектов не загружен'); return; }
        var vehicleCombo = Ext.create('Ext.form.field.ComboBox', { fieldLabel: 'Объект', store: me.vehiclesStore, displayField: 'name', valueField: 'vehid', queryMode: 'local', allowBlank: false, listeners: { select: function(combo, records) { var vehid = records[0].get('vehid'); var sensors = me.mockSensors[vehid] || []; sensorCombo.store.loadData(sensors); sensorCombo.setValue(null); } } });
        var sensorCombo = Ext.create('Ext.form.field.ComboBox', { fieldLabel: 'Метка (ID)', store: Ext.create('Ext.data.Store', { fields: ['sensor_id', 'name'] }), displayField: 'name', valueField: 'sensor_id', queryMode: 'local', allowBlank: false });
        var win = Ext.create('Ext.window.Window', { title: 'Симуляция срабатывания метки', width: 400, modal: true, items: [vehicleCombo, sensorCombo], buttons: [{ text: 'Переместить', handler: function() { var vehid = vehicleCombo.getValue(), sid = sensorCombo.getValue(); if(!vehid || !sid) { Ext.Msg.alert('Ошибка','Выберите объект и метку'); return; } win.close(); me.simulateTrigger(vehid, sid); } }, { text: 'Отмена', handler: function() { win.close(); } }] });
        win.show();
    },

    simulateTrigger: function(vehid, sensorId) {
        var me = this, triggerRecord = null;
        me.triggerPointsStore.each(function(rec) { if (rec.get('sensorId') === sensorId) { triggerRecord = rec; return false; } });
        if (!triggerRecord) { Ext.Msg.alert('Нет точки', 'Для метки "'+sensorId+'" нет точки привязки'); return; }
        var vehicleRecord = me.vehiclesStore.findRecord('vehid', vehid);
        var vehicleName = vehicleRecord ? vehicleRecord.get('name') : 'ID:'+vehid;
        var success = me.moveVehicleMarker(vehid, triggerRecord.get('lat'), triggerRecord.get('lon'));
        if (success) {
            me.logStore.add({ timestamp: Ext.Date.format(new Date(), 'Y-m-d H:i:s'), vehicleName: vehicleName, sensorId: sensorId, targetLabel: triggerRecord.get('label') || sensorId });
            Ext.Msg.alert('Перемещение', 'Объект "'+vehicleName+'" перемещён в точку "'+(triggerRecord.get('label')||sensorId)+'"');
        } else { Ext.Msg.alert('Ошибка', 'Маркер объекта не найден на карте'); }
    },

    moveVehicleMarker: function(vehid, lat, lon) {
        var map = this.getMap();
        if (!map) return false;
        var marker = map.getMarker ? map.getMarker(vehid) : null;
        if (marker && marker.setLatLng) { marker.setLatLng([lat, lon]); return true; }
        else if (map.addMarker) { if(map.removeMarker) map.removeMarker(vehid); map.addMarker({ id: vehid, lat: lat, lon: lon, hint: 'Vehicle' }); return true; }
        return false;
    },

    getMap: function() { return window.getActiveTabMapContainer ? getActiveTabMapContainer() : window.mapContainer; }
});
