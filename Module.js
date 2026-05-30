/**
 * Sensor Dashboard Extension for PILOT
 * Displays all sensors and their current values for selected vehicle.
 * Uses real PILOT endpoint /backend/ax/current_data.php (POST)
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
     * Helper: builds absolute API URL using current PILOT origin.
     * @param {String} endpoint e.g. 'backend/ax/current_data.php'
     * @return {String} full URL
     */
    getApiUrl: function (endpoint) {
        var origin = window.location.origin;
        // Remove trailing slash from origin if present
        if (origin.slice(-1) === '/') {
            origin = origin.slice(0, -1);
        }
        // Ensure endpoint does not start with slash
        if (endpoint.charAt(0) === '/') {
            endpoint = endpoint.slice(1);
        }
        return origin + '/' + endpoint;
    },

    /**
     * Creates the tree panel that displays vehicles from /ax/tree.php
     * @return {Ext.tree.Panel}
     */
    createVehicleTree: function () {
        var me = this;
        var apiUrl = me.getApiUrl('ax/tree.php');

        var treeStore = Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: apiUrl,
                extraParams: {
                    vehs: 1,
                    state: 1
                },
                reader: {
                    type: 'json',
                    rootProperty: 'children' // PILOT returns groups as root array with children
                }
            },
            nodeParam: 'id',
            defaultRootProperty: 'children',
            root: {
                expanded: true,
                text: l('All Vehicles')
            }
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
                        // Only load sensors if the selected node is a vehicle (has vehid)
                        if (record.get('vehid')) {
                            me.loadSensors(record.get('vehid'), record.get('name'));
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
                    // Human-readable sensor name (replace underscores with spaces, capitalize)
                    return Ext.String.capitalize(Ext.String.trim(v.replace(/_/g, ' ')));
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
                    if (window.mileageSS && (sensorName === 'mileage' || sensorName === 'total_mileage')) {
                        return window.mileageSS(v);
                    }
                    if (window.num) {
                        return window.num(v, 1);
                    }
                    // Default: add units where known
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

        // Top toolbar with vehicle name
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

        // Store reference to grid and tbar for later updates
        mainPanel.sensorGrid = grid;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');

        return mainPanel;
    },

    /**
     * Load sensors for a given vehicle ID using POST to current_data.php
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

        // Use the correct endpoint discovered from network inspection
        var apiUrl = me.getApiUrl('backend/ax/current_data.php');

        Ext.Ajax.request({
            method: 'POST',
            url: apiUrl,
            params: {
                vehid: vehid
            },
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
                    Ext.Msg.alert(l('Error'), l('Invalid server response'));
                    me.showEmptySensors();
                    return;
                }

                // Expected response structure: { success: true, data: { ... } }
                if (data && data.success === true && data.data) {
                    var sensors = data.data;
                    var records = [];
                    for (var key in sensors) {
                        if (sensors.hasOwnProperty(key)) {
                            records.push({
                                name: key,
                                value: sensors[key]
                            });
                        }
                    }
                    if (records.length === 0) {
                        me.showEmptySensors();
                    } else {
                        grid.getStore().loadData(records);
                        label.setText(vehicleName);
                    }
                } else {
                    // Fallback: display raw JSON for debugging
                    console.warn('Unexpected response structure from current_data.php', data);
                    grid.getStore().loadData([{
                        name: 'Raw response (unexpected format)',
                        value: JSON.stringify(data)
                    }]);
                    label.setText(vehicleName + ' (format error)');
                }
            },
            failure: function () {
                grid.setLoading(false);
                Ext.Msg.alert(l('Error'), l('Failed to load sensor data. Please check network or try again.'));
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
     * @return {Object|null} with vehid and name
     */
    getSelectedVehicle: function () {
        var tree = this.navTab.items.get(0); // tree is the first item
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
