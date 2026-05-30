/**
 * Sensor Dashboard Extension for PILOT
 * Displays all sensors for selected vehicle.
 * Uses POST to /backend/ax/current_data.php
 * Extracts sensor data from objects array.
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
                text: l('Метка BLE'),          // Заменено с "Model" на "Метка BLE"
                dataIndex: 'ble_label',        // Поле, содержащее метку BLE (может быть ble_tag, ble)
                flex: 1,
                renderer: function (v) {
                    // Если поле отсутствует или пустое, пробуем другие возможные имена
                    if (!v && this && this.data) {
                        if (this.data.ble_tag) return this.data.ble_tag;
                        if (this.data.ble) return this.data.ble;
                    }
                    return v || '—';
                }
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
                    Ext.Msg.alert(l('Error'), l('Invalid JSON response'));
                    me.showEmptySensors();
                    return;
                }

                if (!data.objects || !Ext.isArray(data.objects) || data.objects.length === 0) {
                    me.showEmptySensors();
                    return;
                }

                var foundObject = null;
                for (var i = 0; i < data.objects.length; i++) {
                    var obj = data.objects[i];
                    if (obj.vehid === vehid || obj.id === vehid || obj.object_id === vehid) {
                        foundObject = obj;
                        break;
                    }
                }

                if (!foundObject) {
                    me.showEmptySensors();
                    return;
                }

                var excludeKeys = ['id', 'vehid', 'object_id', 'name', 'model', 'year', 'lat', 'lon', 'plate', 'icon', 'route', 'track'];
                var records = [];
                for (var key in foundObject) {
                    if (foundObject.hasOwnProperty(key) && excludeKeys.indexOf(key) === -1) {
                        var value = foundObject[key];
                        if (value !== null && value !== undefined && value !== '') {
                            records.push({ name: key, value: value });
                        }
                    }
                }

                if (records.length === 0) {
                    for (var key in foundObject) {
                        if (foundObject.hasOwnProperty(key) && key !== 'route' && key !== 'track') {
                            records.push({ name: key, value: foundObject[key] });
                        }
                    }
                }

                if (records.length > 0) {
                    grid.getStore().loadData(records);
                    label.setText(vehicleName);
                } else {
                    grid.getStore().loadData([{
                        name: 'No sensor data',
                        value: 'No fields found'
                    }]);
                    label.setText(vehicleName + ' (no data)');
                }
            },
            failure: function () {
                grid.setLoading(false);
                Ext.Msg.alert(l('Error'), l('Failed to load sensor data.'));
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
