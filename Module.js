/**
 * M25 Monitor — монолитное расширение PILOT.
 * 
 * Левая панель: таблица всех ТС клиента с полями:
 *   Название, UniqID, Agent ID, Тип, Модель, IMEI, Скорость, Топливо, Зажигание, Метка BLE (данные от датчика IButton).
 * 
 * Данные для метки BLE извлекаются из датчика IButton (поиск в sensors или поле ibutton).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация расширения (с меткой BLE от IButton)');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.defer(function() { me.initModule(); }, 500, me);
            return;
        }

        me.createNavigationTab();
        me.loadAllVehicles();

        console.log('[M25] Расширение готово');
    },

    createNavigationTab: function() {
        var me = this;

        this.vehiclesStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'agent_id', 'name', 'imei', 'equipment', 'model', 'speed', 'fuel', 'ignition', 'ble_label'],
            data: [],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        this.vehiclesGrid = Ext.create('Ext.grid.Panel', {
            store: this.vehiclesStore,
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2, sortable: true },
                { text: 'UniqID', dataIndex: 'vehid', width: 80, sortable: true },
                { text: 'Agent ID', dataIndex: 'agent_id', width: 100, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: 'Тип', dataIndex: 'equipment', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'Модель', dataIndex: 'model', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'IMEI', dataIndex: 'imei', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'Скорость', dataIndex: 'speed', width: 70, renderer: function(v) { return v !== undefined ? v + ' км/ч' : '—'; } },
                { text: 'Топливо', dataIndex: 'fuel', width: 80, renderer: function(v) { return v !== undefined ? v + ' л' : '—'; } },
                { text: 'Зажигание', dataIndex: 'ignition', width: 80, renderer: function(v) { return v === 1 ? 'Вкл' : (v === 0 ? 'Выкл' : '—'); } },
                { text: 'Метка BLE (IButton)', dataIndex: 'ble_label', width: 120, sortable: true, renderer: function(v) { return v || '—'; } }
            ],
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [{
                    text: 'Обновить список',
                    iconCls: 'fa fa-sync-alt',
                    handler: function() { me.loadAllVehicles(); },
                    scope: me
                }]
            }]
        });

        this.navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [this.vehiclesGrid]
        });
        skeleton.navigation.add(this.navTab);
    },

    loadAllVehicles: function() {
        var me = this;
        if (this.vehiclesGrid) this.vehiclesGrid.setLoading(true);

        // 1. Получаем список ТС из tree.php
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(resp) {
                var treeData;
                try {
                    treeData = Ext.decode(resp.responseText);
                } catch(e) {
                    console.error('[M25] Ошибка парсинга tree.php', e);
                    me.showErrorAndFinish('Ошибка разбора данных от PILOT');
                    return;
                }
                console.log('[M25] tree.php получен');
                var nodes = me.normalizeTreeResponse(treeData);
                var allVehicles = me.extractAllVehiclesUniversal(nodes);
                if (allVehicles.length === 0) {
                    me.showErrorAndFinish('Не найдено ни одного транспортного средства');
                    return;
                }

                // 2. Получаем текущие данные (включая датчики IButton)
                Ext.Ajax.request({
                    url: '/ax/current_data.php',
                    success: function(resp2) {
                        var currentRaw;
                        try {
                            currentRaw = Ext.decode(resp2.responseText);
                        } catch(e) {
                            console.error('[M25] Ошибка парсинга current_data', e);
                            me.showErrorAndFinish('Ошибка разбора текущих данных');
                            return;
                        }
                        var currentMap = me.normalizeCurrentData(currentRaw);
                        var records = [];
                        Ext.Array.each(allVehicles, function(veh) {
                            var cur = currentMap[veh.vehid] || {};
                            var bleValue = me.extractIButtonValue(cur);
                            records.push({
                                vehid: veh.vehid,
                                name: veh.name,
                                agent_id: veh.agent_id || '',
                                equipment: veh.equipment || '',
                                model: veh.model || '',
                                imei: veh.imei || '',
                                speed: cur.speed,
                                fuel: cur.fuel,
                                ignition: cur.ignition,
                                ble_label: bleValue
                            });
                        });
                        me.vehiclesStore.loadData(records);
                        if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                    },
                    failure: function() {
                        me.showErrorAndFinish('Не удалось загрузить текущие параметры');
                    }
                });
            },
            failure: function() {
                me.showErrorAndFinish('Не удалось загрузить список ТС');
            }
        });
    },

    // Вспомогательный метод для вывода ошибки и снятия загрузки
    showErrorAndFinish: function(msg) {
        Ext.Msg.alert('Ошибка', msg);
        if (this.vehiclesGrid) this.vehiclesGrid.setLoading(false);
    },

    // Нормализация ответа tree.php в массив узлов
    normalizeTreeResponse: function(data) {
        if (Ext.isArray(data)) return data;
        if (data && Ext.isObject(data)) {
            if (data.root && Ext.isArray(data.root)) return data.root;
            if (data.data && Ext.isArray(data.data)) return data.data;
            if (data.children && Ext.isArray(data.children)) return data.children;
            for (var key in data) {
                if (Ext.isArray(data[key])) return data[key];
            }
        }
        return [];
    },

    // Нормализация ответа current_data в карту { vehid: данные }
    normalizeCurrentData: function(data) {
        var map = {};
        var items = [];
        if (Ext.isArray(data)) {
            items = data;
        } else if (data && Ext.isObject(data)) {
            items = data.objects || data.data || data.items || [];
        }
        Ext.Array.each(items, function(item) {
            var id = item.vehid || item.id || item.unit_id;
            if (id) map[String(id)] = item;
        });
        return map;
    },

    // Универсальный сбор всех ТС из дерева (без фильтрации)
    extractAllVehiclesUniversal: function(nodes) {
        var result = [];
        var me = this;
        Ext.Array.each(nodes, function(node) {
            var isVehicle = false;
            if (node.type === 'veh' || node.type === 'object' || node.type === 'unit' || node.type === 'item') isVehicle = true;
            if (!isVehicle && (node.vehid || node.id || node.unit_id)) isVehicle = true;
            if (!isVehicle && (node.speed !== undefined || node.fuel !== undefined)) isVehicle = true;
            if (isVehicle) {
                var vehid = node.vehid || node.id || node.unit_id;
                if (vehid) {
                    result.push({
                        vehid: String(vehid),
                        name: node.text || node.name || node.label || 'Без имени',
                        equipment: me.extractField(node, ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker', 'gps_type', 'type_name']),
                        imei: me.extractField(node, ['imei', 'serial', 'device_id', 'tracker_serial', 'serial_number']),
                        model: me.extractField(node, ['model', 'vehicle_model', 'car_model', 'model_name']),
                        agent_id: me.extractField(node, ['agent_id', 'agentId', 'agent', 'driver_id', 'user_id', 'driver'])
                    });
                }
            } else if (node.children && node.children.length) {
                result = result.concat(me.extractAllVehiclesUniversal(node.children));
            } else if (node.items && node.items.length) {
                result = result.concat(me.extractAllVehiclesUniversal(node.items));
            }
        });
        return result;
    },

    // Поиск значения датчика IButton / метки BLE в данных ТС
    extractIButtonValue: function(vehicleData) {
        if (!vehicleData) return '';
        // 1. Прямое поле ibutton
        if (vehicleData.ibutton) return String(vehicleData.ibutton);
        if (vehicleData.ble_tag) return String(vehicleData.ble_tag);
        // 2. Поиск в массиве sensors
        var sensors = vehicleData.sensors;
        if (Ext.isArray(sensors)) {
            var iButtonSensor = Ext.Array.findBy(sensors, function(s) {
                var name = (s.name || s.label || '').toLowerCase();
                return name.indexOf('ibutton') !== -1 || name.indexOf('i-button') !== -1 || name.indexOf('ble') !== -1 || name === 'метка';
            });
            if (iButtonSensor && iButtonSensor.value !== undefined) {
                return String(iButtonSensor.value);
            }
        }
        // 3. Если ничего не найдено
        return '';
    },

    extractField: function(node, fieldNames) {
        for (var i = 0; i < fieldNames.length; i++) {
            var val = node[fieldNames[i]];
            if (val !== undefined && val !== null && val !== '') {
                return String(val);
            }
        }
        return '';
    }
});
