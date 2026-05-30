/**
 * Sensor Dashboard Extension for PILOT
 * Displays all sensors and their current values for selected vehicle.
 * Uses POST to /backend/ax/current_data.php
 * Includes full response logging and adaptive parsing.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    initModule: function () {
        var me = this;

        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Sensor Dashboard'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [me.createVehicleTree()]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;
    },

    getApiUrl: function (endpoint) {
        var origin = window.location.origin;
        if (origin.slice(-1) === '/') origin = origin.slice(0, -1);
        if (endpoint.charAt(0) === '/') endpoint = endpoint.slice(1);
        return origin + '/' + endpoint;
    },

    createVehicleTree: function () {
        var me = this;
        var apiUrl = me.getApiUrl('ax/tree.php');

        var treeStore = Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: apiUrl,
                extraParams: { vehs: 1, state: 1 },
                reader: { type: 'json', rootProperty: 'children' }
            },
            nodeParam: 'id',
            defaultRootProperty: 'children',
            root: { expanded: true, text: l('All Vehicles') }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn',
                text: l('Vehicle'),
                dataIndex: 'name',
                flex: 2
            }, {
                text: l('Model'),
                dataIndex: 'model',
                flex: 1,
                renderer: function (v) { return v || '—'; }
            }, {
                text: l('Year'),
                dataIndex: 'year',
                flex: 1,
                renderer: function (v) { return v || '—'; }
            }],
            listeners: {
                selectionchange: function (selModel, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        if (record.get('vehid')) {
                            me.loadSensors(record.get('vehid'), record.get('name'));
                        } else {
                            me.mainPanel.down('#sensorGrid').getStore().removeAll();
                            me.mainPanel.down('#vehicleNameLabel').setText(l('Select a vehicle'));
                        }
                    }
                },
                scope: me
            }
        });

        return tree;
    },

    createMainPanel: function () {
        var me = this;

        var sensorStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: []
        });

        var grid = Ext.create('Ext.grid.Panel', {
            itemId: 'sensorGrid',
            store: sensorStore,
            columns: [{
                text: l('Sensor'),
                dataIndex: 'name',
                flex: 2,
                renderer: function (v) {
                    return Ext.String.capitalize(Ext.String.trim(v.replace(/_/g, ' ')));
                }
            }, {
                text: l('Value'),
                dataIndex: 'value',
                flex: 1,
                renderer: function (v, meta, record) {
                    var sensorName = record.get('name');
                    if (window.speedSS && sensorName === 'speed') return window.speedSS(v);
                    if (window.mileageSS && (sensorName === 'mileage' || sensorName === 'total_mileage')) return window.mileageSS(v);
                    if (window.num) return window.num(v, 1);
                    if (sensorName === 'fuel_level') return v + ' %';
                    if (sensorName === 'temperature') return v + ' °C';
                    if (sensorName === 'voltage') return v + ' V';
                    if (sensorName === 'ignition') return v == 1 ? l('ON') : l('OFF');
                    return v;
                }
            }],
            viewConfig: {
                emptyText: l('Select a vehicle from the left tree to see sensors')
            },
            bbar: [{
                text: l('Refresh'),
                iconCls: 'fa fa-refresh',
                handler: function () {
                    var selected = me.getSelectedVehicle();
                    if (selected && selected.vehid) {
                        me.loadSensors(selected.vehid, selected.name);
                    }
                },
                scope: me
            }]
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                xtype: 'label',
                itemId: 'vehicleNameLabel',
                text: l('No vehicle selected'),
                style: 'font-weight: bold; font-size: 14px;'
            }, '->', {
                xtype: 'button',
                text: l('Refresh'),
                iconCls: 'fa fa-refresh',
                handler: function () {
                    var selected = me.getSelectedVehicle();
                    if (selected && selected.vehid) {
                        me.loadSensors(selected.vehid, selected.name);
                    }
                }
            }]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            tbar: tbar,
            items: [grid]
        });

        mainPanel.sensorGrid = grid;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');

        return mainPanel;
    },

    /**
     * Main method to load sensors. Logs full response and adapts to various structures.
     */
    loadSensors: function (vehid, vehicleName) {
        var me = this;
        var mainPanel = me.mainPanel;
        var grid = mainPanel.sensorGrid;
        var label = mainPanel.vehicleLabel;

        grid.setLoading(true);
        label.setText(vehicleName + ' (' + l('loading...') + ')');

        var apiUrl = me.getApiUrl('backend/ax/current_data.php');

        Ext.Ajax.request({
            method: 'POST',
            url: apiUrl,
            params: { vehid: vehid },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            timeout: 10000,
            success: function (response) {
                grid.setLoading(false);

                var data;
                try {
                    data = Ext.decode(response.responseText);
                } catch (e) {
                    console.error('JSON decode error', e);
                    Ext.Msg.alert(l('Error'), l('Invalid JSON response'));
                    me.showEmptySensors();
                    return;
                }

                // Логируем полный ответ в консоль для отладки
                console.log('[SensorDashboard] Full response from current_data.php:', data);
                console.log('[SensorDashboard] Response type:', typeof data);
                console.log('[SensorDashboard] Response keys:', data ? Object.keys(data) : 'null');

                // Автоматическое извлечение объекта с датчиками
                var sensors = null;

                if (data && typeof data === 'object') {
                    // Вариант 1: data.data
                    if (data.data && typeof data.data === 'object') {
                        sensors = data.data;
                        console.log('[SensorDashboard] Using data.data');
                    }
                    // Вариант 2: data.result
                    else if (data.result && typeof data.result === 'object') {
                        sensors = data.result;
                        console.log('[SensorDashboard] Using data.result');
                    }
                    // Вариант 3: data.items
                    else if (data.items && typeof data.items === 'object') {
                        sensors = data.items;
                        console.log('[SensorDashboard] Using data.items');
                    }
                    // Вариант 4: data.sensors
                    else if (data.sensors && typeof data.sensors === 'object') {
                        sensors = data.sensors;
                        console.log('[SensorDashboard] Using data.sensors');
                    }
                    // Вариант 5: весь ответ, исключая служебные поля
                    else {
                        var candidates = {};
                        for (var key in data) {
                            if (data.hasOwnProperty(key) && 
                                key !== 'success' && 
                                key !== 'message' && 
                                key !== 'error' && 
                                key !== 'status' &&
                                key !== 'code') {
                                candidates[key] = data[key];
                            }
                        }
                        if (Object.keys(candidates).length > 0) {
                            sensors = candidates;
                            console.log('[SensorDashboard] Using filtered top-level keys');
                        }
                    }
                }

                // Если датчики найдены и не пустые
                if (sensors && Object.keys(sensors).length > 0) {
                    var records = [];
                    for (var key in sensors) {
                        if (sensors.hasOwnProperty(key)) {
                            var value = sensors[key];
                            // Если значение само объект, пробуем сериализовать
                            if (typeof value === 'object') {
                                value = JSON.stringify(value);
                            }
                            records.push({ name: key, value: value });
                        }
                    }
                    grid.getStore().loadData(records);
                    label.setText(vehicleName);
                    console.log('[SensorDashboard] Loaded ' + records.length + ' sensors');
                } else {
                    // Ничего не нашли – показываем сырой ответ для диагностики
                    console.warn('[SensorDashboard] Could not extract sensors from response', data);
                    grid.getStore().loadData([{
                        name: '⚠️ Raw response (check console)',
                        value: JSON.stringify(data, null, 2).substring(0, 500)
                    }]);
                    label.setText(vehicleName + ' (unexpected format)');
                }
            },
            failure: function (response) {
                grid.setLoading(false);
                console.error('[SensorDashboard] Request failed', response);
                Ext.Msg.alert(l('Error'), l('Failed to load sensor data. Status: ' + response.status));
                me.showEmptySensors();
            }
        });
    },

    showEmptySensors: function () {
        var mainPanel = this.mainPanel;
        if (mainPanel && mainPanel.sensorGrid) {
            mainPanel.sensorGrid.getStore().removeAll();
            var selected = this.getSelectedVehicle();
            mainPanel.vehicleLabel.setText(selected ? selected.name : l('No vehicle selected'));
        }
    },

    getSelectedVehicle: function () {
        var tree = this.navTab.items.get(0);
        var selection = tree.getSelectionModel().getSelection();
        if (selection && selection.length) {
            var rec = selection[0];
            if (rec.get('vehid')) {
                return {
                    vehid: rec.get('vehid'),
                    name: rec.get('name')
                };
            }
        }
        return null;
    }
});
