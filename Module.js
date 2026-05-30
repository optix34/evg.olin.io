/**
 * Sensor Dashboard Extension for PILOT
 * Right panel split:
 * - Top: editable checkboxes for selected vehicle (full width, horizontal)
 * - Bottom: grid with all vehicles and their sensor states (read-only)
 * Lock icon indicates edit mode.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    sensors: [
        { name: 'aog', label: 'АОГ' },
        { name: 'video', label: 'Видео' },
        { name: 'tablo', label: 'Табло' },
        { name: 'voice', label: 'Голос' },
        { name: 'tf', label: 'ТФ' },
        { name: 'kpp', label: 'КПП' },
        { name: 'thg', label: 'ТХГ' },
        { name: 'dut', label: 'ДУТ' },
        { name: 'temp_sensor', label: 'Датчик t' }
    ],

    initModule: function () {
        var me = this;
        me.allVehicles = []; // инициализируем сразу
        me.addCustomStyles();

        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Sensor Dashboard',
            iconCls: 'fa fa-microchip',
            width: 320,
            layout: 'fit',
            items: [me.createVehicleTree()]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;
    },

    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            .sensor-dashboard-container {
                background: #f9f9f9 !important;
            }
            .top-checkbox-container {
                background: #ffffff;
                border-bottom: 1px solid #d5d8dc;
                padding: 12px 10px;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 12px 20px;
            }
            .sensor-checkbox .x-form-cb-label {
                color: #2c3e50 !important;
                font-weight: 600 !important;
                font-size: 13px !important;
                margin-left: 5px !important;
            }
            .sensor-checkbox .x-form-checkbox {
                transform: scale(1.1);
            }
            .sensor-checkbox .x-form-checkbox:disabled {
                opacity: 0.9 !important;
                background-color: #eef2f7 !important;
                border-color: #b0c4de !important;
            }
            .vehicles-grid {
                border-top: 1px solid #d5d8dc;
            }
            .sensor-dashboard-container .x-toolbar {
                background: #f0f2f5 !important;
                border-bottom: 1px solid #d5d8dc !important;
            }
        `;
        document.head.appendChild(styleEl);
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
            root: { expanded: true, text: 'Все ТС' }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn',
                text: 'ТС',
                dataIndex: 'name',
                flex: 2
            }, {
                text: 'Метка BLE (IButton)',
                dataIndex: 'ibutton',
                flex: 1,
                renderer: function (v, meta, record) {
                    if (v) return v;
                    if (record && record.get) {
                        if (record.get('iButton')) return record.get('iButton');
                        if (record.get('ibtn')) return record.get('ibtn');
                        if (record.get('key_id')) return record.get('key_id');
                        if (record.get('ble_label')) return record.get('ble_label');
                        if (record.get('ble_tag')) return record.get('ble_tag');
                        if (record.get('ble')) return record.get('ble');
                    }
                    return '—';
                }
            }, {
                text: 'Год',
                dataIndex: 'year',
                flex: 1,
                renderer: function (v) { return v || '—'; }
            }],
            listeners: {
                selectionchange: function (selModel, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        if (record.get('vehid')) {
                            me.loadConfigForVehicle(record.get('vehid'), record.get('name'));
                        } else {
                            me.clearTopForm();
                        }
                    }
                },
                scope: me
            }
        });

        // Загружаем дерево и собираем все ТС
        treeStore.load({
            callback: function() {
                me.allVehicles = [];
                me.collectAllVehicles(treeStore.getRootNode());
                me.refreshAllVehiclesGrid();
            },
            scope: me
        });

        return tree;
    },

    collectAllVehicles: function (node) {
        var me = this;
        if (!node) return;
        if (node.get && node.get('vehid')) {
            me.allVehicles.push({
                vehid: node.get('vehid'),
                name: node.get('name')
            });
        }
        var childNodes = node.childNodes;
        if (childNodes && childNodes.length) {
            Ext.each(childNodes, function (child) {
                me.collectAllVehicles(child);
            });
        }
    },

    refreshAllVehiclesGrid: function () {
        var me = this;
        var grid = me.allVehiclesGrid;
        if (!grid) return;

        var data = [];
        Ext.each(me.allVehicles, function (vehicle) {
            var storageKey = 'sensor_dashboard_' + vehicle.vehid;
            var saved = localStorage.getItem(storageKey);
            var values = saved ? JSON.parse(saved) : {};
            var record = {
                vehid: vehicle.vehid,
                name: vehicle.name
            };
            Ext.each(me.sensors, function (sensor) {
                record[sensor.name] = (values[sensor.name] === 'yes') ? 'Да' : 'Нет';
            });
            data.push(record);
        });
        grid.getStore().loadData(data);
    },

    createMainPanel: function () {
        var me = this;

        var topContainer = Ext.create('Ext.container.Container', {
            cls: 'top-checkbox-container',
            itemId: 'topCheckboxContainer'
        });

        // Формируем колонки для грида (без Ext.map)
        var gridColumns = [
            { text: 'ТС', dataIndex: 'name', flex: 2, sortable: true }
        ];
        for (var i = 0; i < me.sensors.length; i++) {
            gridColumns.push({
                text: me.sensors[i].label,
                dataIndex: me.sensors[i].name,
                flex: 0.8,
                align: 'center'
            });
        }

        var gridStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name'].concat(Ext.Array.map(me.sensors, function(s) { return s.name; }))
        });
        var grid = Ext.create('Ext.grid.Panel', {
            cls: 'vehicles-grid',
            store: gridStore,
            columns: gridColumns,
            viewConfig: { stripeRows: true }
        });
        me.allVehiclesGrid = grid;

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            tbar: me.createToolbar(),
            items: [
                { xtype: 'container', layout: 'fit', height: 160, items: [topContainer] },
                { xtype: 'splitter', height: 5 },
                { xtype: 'container', layout: 'fit', flex: 1, items: [grid] }
            ]
        });

        mainPanel.topContainer = topContainer;
        mainPanel.vehicleLabel = mainPanel.down('#vehicleNameLabel');
        mainPanel.lockIcon = mainPanel.down('#lockIcon');
        return mainPanel;
    },

    createToolbar: function () {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { xtype: 'label', itemId: 'vehicleNameLabel', text: 'ТС не выбрано', style: 'font-weight: bold; font-size: 14px;' },
                { xtype: 'tbtext', itemId: 'lockIcon', text: '🔒', style: 'font-size: 14px; margin-left: 5px;' },
                '->',
                {
                    text: 'Редактировать',
                    handler: function () {
                        me.setSensorsEditable(true);
                        me.updateLockIcon(true);
                    }
                },
                {
                    text: 'Сохранить',
                    handler: function () {
                        me.saveCurrentConfig();
                        me.setSensorsEditable(false);
                        me.updateLockIcon(false);
                        me.refreshAllVehiclesGrid();
                    }
                }
            ]
        });
    },

    updateLockIcon: function (isEditing) {
        var lockIcon = this.mainPanel.lockIcon;
        if (lockIcon) {
            lockIcon.setText(isEditing ? '🔓' : '🔒');
        }
    },

    loadConfigForVehicle: function (vehid, vehicleName) {
        var me = this;
        var container = me.mainPanel.topContainer;
        var label = me.mainPanel.vehicleLabel;

        label.setText(vehicleName);
        container.removeAll();

        var storageKey = 'sensor_dashboard_' + vehid;
        var saved = localStorage.getItem(storageKey);
        var values = saved ? JSON.parse(saved) : {};

        for (var i = 0; i < me.sensors.length; i++) {
            var sensor = me.sensors[i];
            var checked = (values[sensor.name] === 'yes');
            var checkbox = Ext.create('Ext.form.field.Checkbox', {
                fieldLabel: sensor.label,
                labelAlign: 'right',
                itemId: sensor.name,
                checked: checked,
                disabled: true,
                cls: 'sensor-checkbox'
            });
            container.add(checkbox);
        }

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
        me.updateLockIcon(false);
    },

    saveCurrentConfig: function () {
        var me = this;
        if (!me.currentVehid) return;

        var container = me.mainPanel.topContainer;
        var values = {};

        for (var i = 0; i < me.sensors.length; i++) {
            var sensor = me.sensors[i];
            var checkbox = container.down('#' + sensor.name);
            if (checkbox) {
                values[sensor.name] = checkbox.checked ? 'yes' : 'no';
            }
        }

        var storageKey = 'sensor_dashboard_' + me.currentVehid;
        localStorage.setItem(storageKey, JSON.stringify(values));
        Ext.Msg.alert('Сохранено', 'Настройки сохранены');
    },

    setSensorsEditable: function (editable) {
        var container = this.mainPanel.topContainer;
        for (var i = 0; i < this.sensors.length; i++) {
            var checkbox = container.down('#' + this.sensors[i].name);
            if (checkbox) checkbox.setDisabled(!editable);
        }
    },

    clearTopForm: function () {
        var mainPanel = this.mainPanel;
        mainPanel.topContainer.removeAll();
        mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
        this.updateLockIcon(false);
    }
});
