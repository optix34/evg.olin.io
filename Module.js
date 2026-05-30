/**
 * Sensor Dashboard Extension for PILOT
 * Right panel: horizontal checkboxes for each sensor (AOG, Video, etc.)
 * Values stored in localStorage per vehicle.
 * Enhanced contrast: black text, bold labels, crisp checkboxes.
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

        // Добавляем CSS для улучшенной контрастности
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

    // Добавление стилей для контрастного отображения
    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            .sensor-dashboard-checkbox .x-form-field {
                color: #000000 !important;
                font-weight: 500 !important;
                font-size: 13px !important;
            }
            .sensor-dashboard-checkbox .x-form-cb-label {
                color: #000000 !important;
                font-weight: bold !important;
                font-size: 14px !important;
                margin-left: 5px !important;
            }
            .sensor-dashboard-checkbox .x-form-checkbox {
                transform: scale(1.1);
                margin-right: 5px !important;
            }
            .sensor-dashboard-container .x-panel-body {
                background: #ffffff !important;
            }
            .sensor-dashboard-container .x-toolbar {
                background: #f5f5f5 !important;
                border-bottom: 1px solid #ddd !important;
            }
            .sensor-dashboard-container .x-btn {
                font-weight: bold !important;
            }
            .sensor-dashboard-label {
                color: #000000 !important;
                font-weight: bold !important;
                font-size: 15px !important;
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
            layout: 'hbox',
            padding: 10,
            cls: 'sensor-dashboard-container',
            defaults: { margin: '0 15 0 0' }
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { 
                    xtype: 'label', 
                    itemId: 'vehicleNameLabel', 
                    text: 'ТС не выбрано', 
                    style: 'font-weight: bold; font-size: 14px; color: #000000;',
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
            cls: 'sensor-dashboard-container'
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
                labelAlign: 'top',
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
            if (checkbox) checkbox.setDisabled(!editable);
        });
    },

    clearConfigForm: function () {
        var mainPanel = this.mainPanel;
        mainPanel.sensorsContainer.removeAll();
        mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
    }
});
