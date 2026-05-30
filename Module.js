/**
 * Sensor Dashboard Extension for PILOT
 * Right panel: horizontal checkboxes, full width, PILOT-like style.
 * Disabled elements are bright and readable.
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
            /* Общий контейнер правой панели */
            .sensor-dashboard-container {
                background: #f9f9f9 !important;
            }
            .sensor-dashboard-container .x-panel-body {
                background: #f9f9f9 !important;
            }
            /* Горизонтальный контейнер чекбоксов – равномерное распределение */
            .sensors-hbox-container {
                display: flex !important;
                flex-wrap: wrap !important;
                justify-content: space-around !important;
                align-items: flex-start !important;
                width: 100% !important;
                background: #ffffff !important;
                padding: 15px 10px !important;
                border-radius: 4px !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
            }
            /* Каждый чекбокс – гибкая ширина, минимальная 100px */
            .sensor-dashboard-checkbox {
                flex: 1 1 100px !important;
                min-width: 90px !important;
                margin: 5px 8px !important;
                background: transparent !important;
            }
            /* Стили для label (название датчика) */
            .sensor-dashboard-checkbox .x-form-cb-label {
                color: #2c3e50 !important;
                font-weight: 600 !important;
                font-size: 13px !important;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
                margin-left: 6px !important;
            }
            /* Сам чекбокс */
            .sensor-dashboard-checkbox .x-form-checkbox {
                transform: scale(1.15) !important;
                margin-right: 5px !important;
                cursor: default !important;
            }
            /* Неактивное состояние – яркое, но без возможности редактирования */
            .sensor-dashboard-checkbox .x-form-checkbox:disabled {
                opacity: 0.9 !important;
                background-color: #eef2f7 !important;
                border-color: #b0c4de !important;
            }
            .sensor-dashboard-checkbox .x-form-field:disabled + .x-form-cb-label {
                color: #1a2a3a !important;
                opacity: 0.85 !important;
            }
            /* Активное состояние при редактировании */
            .sensor-dashboard-checkbox-editable .x-form-checkbox {
                cursor: pointer !important;
            }
            /* Тулубар */
            .sensor-dashboard-container .x-toolbar {
                background: #f0f2f5 !important;
                border-bottom: 1px solid #d5d8dc !important;
                padding: 8px 10px !important;
            }
            /* Кнопки */
            .sensor-dashboard-container .x-btn {
                font-weight: 600 !important;
                background: #ffffff !important;
                border: 1px solid #bdc3c7 !important;
                color: #2c3e50 !important;
            }
            .sensor-dashboard-container .x-btn:hover {
                background: #e8f0fe !important;
                border-color: #5dade2 !important;
            }
            /* Метка ТС */
            .sensor-dashboard-label {
                color: #1a2c3e !important;
                font-weight: bold !important;
                font-size: 15px !important;
                text-shadow: none !important;
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
                            me.clearConfigForm();
                        }
                    }
                }
            }
        });

        return tree;
    },

    createMainPanel: function () {
        var me = this;

        var fieldContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsContainer',
            layout: {
                type: 'hbox',
                align: 'stretch',
                pack: 'start',
                wrap: true   // перенос на новую строку, если не помещаются
            },
            cls: 'sensors-hbox-container',
            defaults: {
                margin: '0 10 10 0'
            }
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                {
                    xtype: 'label',
                    itemId: 'vehicleNameLabel',
                    text: 'ТС не выбрано',
                    cls: 'sensor-dashboard-label'
                },
                '->',
                {
                    text: 'Редактировать',
                    handler: function () { me.setSensorsEditable(true); }
                },
                {
                    text: 'Применить',
                    handler: function () {
                        me.saveCurrentConfig();
                        me.setSensorsEditable(false);
                    }
                }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            tbar: tbar,
            items: [fieldContainer],
            cls: 'sensor-dashboard-container',
            bodyCls: 'sensor-dashboard-container'
        });

        mainPanel.sensorsContainer = fieldContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        return mainPanel;
    },

    loadConfigForVehicle: function (vehid, vehicleName) {
        var me = this;
        var container = me.mainPanel.sensorsContainer;
        var label = me.mainPanel.vehicleLabel;

        label.setText(vehicleName);
        container.removeAll();

        var storageKey = 'sensor_dashboard_' + vehid;
        var saved = localStorage.getItem(storageKey);
        var values = saved ? JSON.parse(saved) : {};

        Ext.each(me.sensors, function (sensor) {
            var checked = (values[sensor.name] === 'yes');
            var checkbox = Ext.create('Ext.form.field.Checkbox', {
                fieldLabel: sensor.label,
                labelAlign: 'right',
                itemId: sensor.name,
                checked: checked,
                disabled: true,
                cls: 'sensor-dashboard-checkbox',
                labelCls: 'sensor-dashboard-checkbox-label',
                inputCls: 'sensor-dashboard-checkbox-input'
            });
            container.add(checkbox);
        });

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
    },

    saveCurrentConfig: function () {
        var me = this;
        if (!me.currentVehid) return;

        var container = me.mainPanel.sensorsContainer;
        var values = {};

        Ext.each(me.sensors, function (sensor) {
            var checkbox = container.down('#' + sensor.name);
            if (checkbox) {
                values[sensor.name] = checkbox.checked ? 'yes' : 'no';
            }
        });

        var storageKey = 'sensor_dashboard_' + me.currentVehid;
        localStorage.setItem(storageKey, JSON.stringify(values));
        Ext.Msg.alert('Сохранено', 'Настройки сохранены');
    },

    setSensorsEditable: function (editable) {
        var container = this.mainPanel.sensorsContainer;
        Ext.each(this.sensors, function (sensor) {
            var checkbox = container.down('#' + sensor.name);
            if (checkbox) {
                checkbox.setDisabled(!editable);
                if (editable) {
                    checkbox.addCls('sensor-dashboard-checkbox-editable');
                } else {
                    checkbox.removeCls('sensor-dashboard-checkbox-editable');
                }
            }
        });
    },

    clearConfigForm: function () {
        var mainPanel = this.mainPanel;
        mainPanel.sensorsContainer.removeAll();
        mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
    }
});
