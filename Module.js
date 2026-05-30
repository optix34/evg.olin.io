/**
 * Sensor Dashboard Extension for PILOT
 * Displays all sensors and their current values for a selected vehicle.
 *
 * @version 2.0.0
 * @author Your Name
 *
 * @class Store.sensor_dashboard.Module
 * @extends Ext.Component
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    /**
     * The main entry point for the extension, called by the PILOT runtime.
     * @param {Object} config The configuration object.
     */
    initModule: function (config) {
        const me = this;

        // 1. Create the left navigation panel with the vehicle tree
        const navPanel = me.createNavPanel();

        // 2. Create the main content panel
        const mainPanel = me.createMainPanel();

        // 3. Link the navigation panel to the main panel (required by PILOT)
        navPanel.map_frame = mainPanel;

        // 4. Add both components to the main PILOT interface
        skeleton.navigation.add(navPanel);
        skeleton.mapframe.add(mainPanel);
    },

    /**
     * Creates the left navigation panel with the vehicle tree.
     * @return {Pilot.utils.LeftBarPanel} The navigation panel.
     */
    createNavPanel: function () {
        const me = this;

        // Create the store for the vehicle tree
        const vehicleStore = Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: '/backend/ax/current_data.php', // Используем правильный API для загрузки списка
                method: 'POST', // В соответствии с вашим запросом
                extraParams: {
                    // Здесь могут потребоваться параметры, если они нужны для получения списка объектов.
                    // Например, 'cmd': 'list' или что-то подобное. 
                    // Если запрос без параметров не работает, добавьте их по аналогии с датчиками.
                },
                reader: {
                    type: 'json',
                    rootProperty: 'data' // Предполагаем, что список машин лежит в поле 'data'
                }
            },
            root: {
                expanded: true,
                text: l('All Vehicles')
            }
        });

        // Create the tree panel
        const treePanel = Ext.create('Ext.tree.Panel', {
            store: vehicleStore,
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
                renderer: (value) => value || '—'
            }, {
                text: l('Year'),
                dataIndex: 'year',
                flex: 1,
                renderer: (value) => value || '—'
            }],
            listeners: {
                selectionchange: (selModel, selected) => {
                    if (selected && selected.length) {
                        const record = selected[0];
                        if (record.get('vehid')) {
                            me.loadSensorsForVehicle(record.get('vehid'), record.get('name'));
                        } else {
                            me.clearSensorDisplay(l('Select a vehicle'));
                        }
                    } else {
                        me.clearSensorDisplay(l('No vehicle selected'));
                    }
                },
                scope: me
            }
        });

        // Wrap the tree in a LeftBarPanel as required by PILOT
        return Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Sensor Dashboard'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [treePanel]
        });
    },

    /**
     * Creates the main content panel to display sensor data.
     * @return {Ext.panel.Panel} The main panel.
     */
    createMainPanel: function () {
        const me = this;

        const sensorStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: []
        });

        const sensorGrid = Ext.create('Ext.grid.Panel', {
            store: sensorStore,
            columns: [{
                text: l('Sensor'),
                dataIndex: 'name',
                flex: 2,
                renderer: (value) => {
                    return Ext.String.capitalize(Ext.String.trim(value.replace(/_/g, ' ')));
                }
            }, {
                text: l('Value'),
                dataIndex: 'value',
                flex: 1,
                renderer: (value, meta, record) => {
                    const sensorName = record.get('name');
                    // Apply PILOT formatters if they exist
                    if (window.speedSS && sensorName === 'speed') {
                        return window.speedSS(value);
                    }
                    if (window.mileageSS && (sensorName === 'mileage' || sensorName === 'total_mileage')) {
                        return window.mileageSS(value);
                    }
                    if (window.num) {
                        return window.num(value, 1);
                    }
                    // Default formatting for common sensors
                    if (sensorName === 'fuel_level') return `${value} %`;
                    if (sensorName === 'temperature') return `${value} °C`;
                    if (sensorName === 'voltage') return `${value} V`;
                    if (sensorName === 'ignition') return value == 1 ? l('ON') : l('OFF');
                    return value;
                }
            }],
            viewConfig: {
                emptyText: l('Select a vehicle from the left tree to see sensors')
            }
        });

        const topToolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                xtype: 'label',
                itemId: 'vehicleNameLabel',
                text: l('No vehicle selected'),
                style: 'font-weight: bold; font-size: 14px;'
            }, '->', {
                xtype: 'button',
                text: l('Refresh'),
                iconCls: 'fa fa-refresh',
                handler: () => {
                    const selectedVehicle = me.getSelectedVehicle();
                    if (selectedVehicle && selectedVehicle.vehid) {
                        me.loadSensorsForVehicle(selectedVehicle.vehid, selectedVehicle.name);
                    }
                }
            }]
        });

        return Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            tbar: topToolbar,
            items: [sensorGrid],
            listeners: {
                afterrender: () => {
                    me.mainPanel = this;
                    me.sensorGrid = sensorGrid;
                    me.vehicleLabel = topToolbar.down('#vehicleNameLabel');
                },
                scope: me
            }
        });
    },

    /**
     * Loads sensor data for a specific vehicle from the API.
     * @param {number} vehid Vehicle ID.
     * @param {string} vehicleName Vehicle name.
     */
    loadSensorsForVehicle: function (vehid, vehicleName) {
        const me = this;
        const grid = me.sensorGrid;
        const label = me.vehicleLabel;

        grid.setLoading(true);
        label.setText(`${vehicleName} (${l('loading...')})`);

        // Используем правильный эндпоинт и метод
        Ext.Ajax.request({
            url: '/backend/ax/current_data.php', // Ваш правильный API
            method: 'POST', // Метод из вашего запроса
            params: {
                vehid: vehid // Передаем ID машины, как мы делали раньше
            },
            timeout: 10000,
            success: (response) => {
                grid.setLoading(false);
                let data;
                try {
                    data = Ext.decode(response.responseText);
                } catch (e) {
                    Ext.Msg.alert(l('Error'), l('Invalid server response'));
                    me.clearSensorDisplay(vehicleName);
                    return;
                }

                if (data && data.success === true && data.data) {
                    const sensors = data.data;
                    const records = [];
                    for (const key in sensors) {
                        if (Object.prototype.hasOwnProperty.call(sensors, key)) {
                            records.push({ name: key, value: sensors[key] });
                        }
                    }
                    if (records.length === 0) {
                        me.clearSensorDisplay(vehicleName);
                    } else {
                        grid.getStore().loadData(records);
                        label.setText(vehicleName);
                    }
                } else {
                    me.clearSensorDisplay(vehicleName);
                }
            },
            failure: () => {
                grid.setLoading(false);
                Ext.Msg.alert(l('Error'), l('Failed to load sensor data. Please check network or try again.'));
                me.clearSensorDisplay(vehicleName);
            },
            scope: me
        });
    },

    /**
     * Clears the sensor grid and resets the label.
     * @param {string} [vehicleName] Optional vehicle name to display.
     */
    clearSensorDisplay: function (vehicleName = l('No vehicle selected')) {
        if (this.sensorGrid) {
            this.sensorGrid.getStore().removeAll();
        }
        if (this.vehicleLabel) {
            this.vehicleLabel.setText(vehicleName);
        }
    },

    /**
     * Gets the currently selected vehicle from the tree.
     * @return {Object|null} The selected vehicle object with vehid and name, or null.
     */
    getSelectedVehicle: function () {
        const treePanel = this.navTab?.items.get(0);
        if (!treePanel) return null;
        const selected = treePanel.getSelectionModel().getSelection();
        if (selected && selected.length) {
            const record = selected[0];
            if (record.get('vehid')) {
                return {
                    vehid: record.get('vehid'),
                    name: record.get('name')
                };
            }
        }
        return null;
    }
});
