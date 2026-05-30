/**
 * Sensor Dashboard Extension for PILOT
 * Displays all sensors and their current values for selected vehicle.
 * Uses correct PILOT API endpoints: /api/api.php with cmd=list and cmd=istatus.
 * Follows AI_SPECS.md strictly.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    /**
     * Required entry point called by PILOT runtime.
     */
    initModule: function () {
        var me = this;

        // 1. Create left navigation tab (vehicle tree)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Sensor Dashboard'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [me.createVehicleTree()]
        });

        // 2. Create main panel (sensor display)
        var mainPanel = me.createMainPanel();

        // 3. Link navigation tab with main panel (required pattern)
        navTab.map_frame = mainPanel;

        // 4. Add components to PILOT skeleton
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        // 5. Store references for later use
        me.mainPanel = mainPanel;
        me.navTab = navTab;
    },

    /**
     * Helper: builds absolute API URL using current origin.
     * @param {String} endpoint e.g. 'ax/tree.php' (unused now, kept for compatibility)
     * @return {String} full URL
     */
    getApiUrl: function (endpoint) {
        var origin = window.location.origin;
        if (origin.substr(-1) === '/') {
            origin = origin.slice(0, -1);
        }
        // Always use /api/api.php for PILOT API
        return origin + '/api/api.php';
    },

    /**
     * Creates the tree panel that displays vehicles from PILOT API (cmd=list)
     * @return {Ext.tree.Panel}
     */
    createVehicleTree: function () {
        var me = this;
        var apiUrl = me.getApiUrl(); // returns /api/api.php

        var treeStore = Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: apiUrl,
                extraParams: {
                    cmd: 'list',
                    node: 1
                },
                reader: {
                    type: 'json',
                    rootProperty: 'list' // PILOT returns objects in "list" array
                }
            },
            // Convert flat list into tree structure (groups and vehicles)
            // PILOT /api/api.php?cmd=list returns a flat array with "parent" field.
            // We'll build tree dynamically in the store's load event.
            root: {
                expanded: true,
                text: l('All Vehicles'),
                children: []
            },
            listeners: {
                load: function (store, records, successful) {
                    if (!successful) return;
                    // Transform flat records into tree hierarchy
                    var tree = store.getRoot();
                    var items = records;
                    var map = {};
                    var roots = [];

                    // First pass: create map of id -> node
                    Ext.each(items, function (item) {
                        var node = {
                            id: item.get('id'),
                            text: item.get('name') || item.get('text') || 'Unnamed',
                            vehid: item.get('id'), // vehicle id
                            name: item.get('name') || item.get('text'),
                            model: item.get('model'),
                            year: item.get('year'),
                            leaf: true, // assume leaf, will be overridden if children exist
                            expanded: false,
                            children: []
                        };
                        map[node.id] = node;
                    });

                    // Second pass: build hierarchy
                    Ext.each(items, function (item) {
                        var node = map[item.get('id')];
                        var parentId = item.get('parent');
                        if (parentId && parentId !== 0 && map[parentId]) {
                            map[parentId].leaf = false;
                            map[parentId].children.push(node);
                        } else {
                            roots.push(node);
                        }
                    });

                    // Clear and set root children
                    tree.removeAll();
                    tree.appendChild(roots);
                },
                scope: me
            }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn',
                text: l('Vehicle'),
                dataIndex: 'text',
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
                        // Only load sensors if the selected node is a vehicle (has vehid and no children)
                        if (record.get('vehid') && !record.hasChildNodes()) {
                            me.loadSensors(record.get('vehid'), record.get('text'));
                        } else {
                            // Group/folder selected – show placeholder
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

    /**
     * Creates the main panel with sensor grid and refresh button.
     * @return {Ext.panel.Panel}
     */
    createMainPanel: function () {
        var me = this;

        // Store for sensor data: dynamic fields name and value
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
                    // Human-readable sensor name
                    var friendly = v.replace(/_/g, ' ');
                    friendly = Ext.String.capitalize(friendly);
                    return friendly;
                }
            }, {
                text: l('Value'),
                dataIndex: 'value',
                flex: 1,
                renderer: function (v, meta, record) {
                    var sensorName = record.get('name');
                    // Apply PILOT formatters if available
                    if (window.speedSS && sensorName === 'speed') {
                        return window.speedSS(v);
                    }
                    if (window.mileageSS && (sensorName === 'total_run' || sensorName === 'mileage')) {
                        return window.mileageSS(v);
                    }
                    if (window.engineHours && sensorName === 'engine_hours') {
                        return window.engineHours(v);
                    }
                    if (window.num) {
                        return window.num(v, 1);
                    }
                    // Add units where known
                    if (sensorName === 'fuel') return v + ' %';
                    if (sensorName === 'temperature') return v + ' °C';
                    if (sensorName === 'voltage') return v + ' V';
                    if (sensorName === 'ignition') return v == 1 ? l('ON') : l('OFF');
                    if (sensorName === 'total_run') return v + ' km';
                    if (sensorName === 'engine_hours') return v + ' h';
                    return v;
                }
            }],
            viewConfig: {
                emptyText: l('Select a vehicle from the left tree to see sensors')
            }
        });

        // Top toolbar with vehicle name and refresh button
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
                },
                scope: me
            }]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            tbar: tbar,
            items: [grid]
        });

        // Store references
        mainPanel.sensorGrid = grid;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');

        return mainPanel;
    },

    /**
     * Load sensors for a given vehicle ID using PILOT API cmd=istatus
     * @param {Number} vehid
     * @param {String} vehicleName
     */
    loadSensors: function (vehid, vehicleName) {
        var me = this;
        var mainPanel = me.mainPanel;
        var grid = mainPanel.sensorGrid;
        var label = mainPanel.vehicleLabel;

        // Show loading mask on grid
        grid.setLoading(true);
        label.setText(vehicleName + ' (' + l('loading...') + ')');

        var apiUrl = me.getApiUrl(); // /api/api.php

        Ext.Ajax.request({
            url: apiUrl,
            method: 'GET',
            params: {
                cmd: 'istatus',
                imei: vehid,
                node: 1
            },
            timeout: 10000,
            success: function (response) {
                grid.setLoading(false);
                var data;
                try {
                    data = Ext.decode(response.responseText);
                } catch (e) {
                    Ext.Msg.alert(l('Error'), l('Invalid server response'));
                    me.showEmptySensors();
                    return;
                }

                if (data && data.code === 0) {
                    var records = [];

                    // Common fields from istatus response
                    if (data.total_run !== undefined) records.push({ name: 'total_run', value: data.total_run });
                    if (data.engine_hours !== undefined) records.push({ name: 'engine_hours', value: data.engine_hours });
                    if (data.fuel !== undefined) records.push({ name: 'fuel', value: data.fuel });
                    if (data.speed !== undefined) records.push({ name: 'speed', value: data.speed });
                    if (data.temperature !== undefined) records.push({ name: 'temperature', value: data.temperature });
                    if (data.voltage !== undefined) records.push({ name: 'voltage', value: data.voltage });
                    if (data.ignition !== undefined) records.push({ name: 'ignition', value: data.ignition });
                    
                    // Fuel sensors (if array)
                    if (data.fuel_sensors && Ext.isArray(data.fuel_sensors)) {
                        Ext.each(data.fuel_sensors, function (fs, idx) {
                            var name = fs.info || ('fuel_sensor_' + (idx+1));
                            records.push({ name: name, value: fs.fuel });
                        });
                    }

                    // Additional custom sensors might be in data.sensors or data.data
                    if (data.sensors && Ext.isObject(data.sensors)) {
                        Ext.iterate(data.sensors, function (key, val) {
                            records.push({ name: key, value: val });
                        });
                    }

                    if (records.length === 0) {
                        me.showEmptySensors();
                        Ext.Msg.alert(l('Info'), l('No sensor data available for this vehicle'));
                    } else {
                        grid.getStore().loadData(records);
                        label.setText(vehicleName);
                    }
                } else {
                    console.error('API error:', data);
                    Ext.Msg.alert(l('Error'), l('Failed to load sensor data. API returned error code: ') + (data ? data.code : 'unknown'));
                    me.showEmptySensors();
                }
            },
            failure: function (response) {
                grid.setLoading(false);
                Ext.Msg.alert(l('Error'), l('Network error: ') + response.status);
                me.showEmptySensors();
            },
            scope: me
        });
    },

    /**
     * Clear sensor grid and show empty message.
     */
    showEmptySensors: function () {
        var mainPanel = this.mainPanel;
        if (mainPanel && mainPanel.sensorGrid) {
            mainPanel.sensorGrid.getStore().removeAll();
            var selected = this.getSelectedVehicle();
            mainPanel.vehicleLabel.setText(selected ? selected.name : l('No vehicle selected'));
        }
    },

    /**
     * Helper: get currently selected vehicle from tree.
     * @return {Object|null} with vehid, name, etc.
     */
    getSelectedVehicle: function () {
        var tree = this.navTab.items.get(0);
        var selection = tree.getSelectionModel().getSelection();
        if (selection && selection.length) {
            var rec = selection[0];
            if (rec.get('vehid') && !rec.hasChildNodes()) {
                return {
                    vehid: rec.get('vehid'),
                    name: rec.get('text')
                };
            }
        }
        return null;
    }
});
