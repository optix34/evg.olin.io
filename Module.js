/**
 * Sensor Dashboard Extension for PILOT
 * Right panel: horizontal checkboxes (full width, bright disabled state),
 * lock icon to indicate read-only mode, and a dashboard grid showing all vehicles and their settings.
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
            /* Контейнер чекбоксов – гибкая сетка */
            .sensors-hbox-container {
                display: flex !important;
                flex-wrap: wrap !important;
                justify-content: flex-start !important;
                align-items: center !important;
                width: 100% !important;
                background: #ffffff !important;
                padding: 12px 10px !important;
                border-bottom: 1px solid #e0e4e8 !important;
                margin-bottom: 10px !important;
            }
            /* Каждый чекбокс */
            .sensor-dashboard-checkbox {
                margin: 5px 12px 5px 0 !important;
                background: transparent !important;
            }
            /* Яркие подписи */
            .sensor-dashboard-checkbox .x-form-cb-label {
                color: #2c3e50 !important;
                font-weight: 600 !important;
                font-size: 13px !important;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
                margin-left: 6px !important;
            }
            /* Чекбокс – чёткий, яркий даже в disabled */
            .sensor-dashboard-checkbox .x-form-checkbox {
                transform: scale(1.15) !important;
                margin-right: 5px !important;
                opacity: 1 !important;
            }
            /* Переопределяем disabled стиль – яркий, без затемнения */
            .sensor-dashboard-checkbox .x-form-checkbox:disabled,
            .sensor-dashboard-checkbox .x-form-field:disabled {
                opacity: 1 !important;
                background-color: #ffffff !important;
                border-color: #80c0e0 !important;
            }
            .sensor-dashboard-checkbox .x-form-field:disabled + .x-form-cb-label {
                color: #1a2c3e !important;
                opacity: 1 !important;
            }
            /* Активный режим (editable) */
            .sensor-dashboard-checkbox-editable .x-form-checkbox {
                cursor: pointer !important;
            }
            /* Тулубар */
            .sensor-dashboard-container .x-toolbar {
                background: #f4f6f9 !important;
                border-bottom: 1px solid #d0d5dc !important;
                padding: 6px 10px !important;
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
            /* Иконка замка */
            .lock-icon {
                font-size: 18px;
                margin-left: 12px;
                color: #2c3e50;
                cursor: default;
            }
            .unlock-icon {
                font-size: 18px;
                margin-left: 12px;
                color: #27ae60;
                cursor: default;
            }
            /* Грид дашборда */
            .dashboard-grid {
                margin-top: 15px;
                border-top: 1px solid #d0d5dc;
            }
            .dashboard-grid .x-grid-header {
                background: #eef2f7 !important;
                font-weight: bold !important;
            }
            .dashboard-grid .x-grid-cell {
                font-size: 12px;
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

        // Контейнер для чекбоксов
        var checkboxesContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsContainer',
            layout: {
                type: 'hbox',
                wrap: true
            },
            cls: 'sensors-hbox-container',
            defaults: { margin: '0 12 5 0' }
        });

        // Дашборд – таблица всех ТС и их настроек
        var dashboardStore = Ext.create('Ext.data.Store', {
            fields: ['vehicleName', 'vehid'].concat(Ext.Array.map(me.sensors, function(s) { return s.name; }))
        });

        var dashboardGrid = Ext.create('Ext.grid.Panel', {
            itemId: 'dashboardGrid',
            store: dashboardStore,
            columns: [
                { text: 'ТС', dataIndex: 'vehicleName', flex: 1.5, fixed: true },
                { text: 'ID', dataIndex: 'vehid', width: 60, hidden: true }
            ].concat(Ext.Array.map(me.sensors, function(s) {
                return { text: s.label, dataIndex: s.name, width: 70, align: 'center', renderer: function(v) { return v === 'yes' ? 'Да' : 'Нет'; } };
            })),
            viewConfig: { stripeRows: true },
            cls: 'dashboard-grid',
            margin: '10 10 10 10',
            height: 300
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { xtype: 'label', itemId: 'vehicleNameLabel', text: 'ТС не выбрано', cls: 'sensor-dashboard-label' },
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
                        me.refreshDashboard();
                    }
                },
                {
                    xtype: 'tbtext',
                    html: '<i class="fa fa-lock" style="font-size:18px; margin-left:8px;" id="lockIcon"></i>',
                    itemId: 'lockIcon'
                }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            tbar: tbar,
            layout: 'vbox',
            items: [checkboxesContainer, dashboardGrid],
            cls: 'sensor-dashboard-container',
            bodyCls: 'sensor-dashboard-container'
        });

        mainPanel.sensorsContainer = checkboxesContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.dashboardGrid = dashboardGrid;
        mainPanel.dashboardStore = dashboardStore;
        mainPanel.lockIcon = tbar.down('#lockIcon');
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
                disabled: true,  // неактивен по умолчанию
                cls: 'sensor-dashboard-checkbox',
                labelCls: 'sensor-dashboard-checkbox-label'
            });
            container.add(checkbox);
        });

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
        me.updateLockIcon(true); // locked
        me.refreshDashboard();
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
        var me = this;
        var container = me.mainPanel.sensorsContainer;
        Ext.each(me.sensors, function (sensor) {
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
        me.updateLockIcon(!editable); // если редактируем – замок открыт (false), иначе закрыт (true)
    },

    updateLockIcon: function (locked) {
        var iconEl = this.mainPanel.lockIcon;
        if (!iconEl) return;
        if (locked) {
            iconEl.update('<i class="fa fa-lock" style="font-size:18px; color:#2c3e50;" title="Заблокировано"></i>');
        } else {
            iconEl.update('<i class="fa fa-unlock-alt" style="font-size:18px; color:#27ae60;" title="Редактирование"></i>');
        }
    },

    refreshDashboard: function () {
        var me = this;
        var store = me.mainPanel.dashboardStore;
        if (!store) return;

        // Получаем все ТС из дерева
        var tree = me.navTab.items.get(0);
        var root = tree.getRootNode();
        var vehicles = [];

        var collectVehicles = function(node) {
            if (node.get('vehid')) {
                vehicles.push({
                    vehid: node.get('vehid'),
                    name: node.get('name')
                });
            }
            node.eachChild(collectVehicles);
        };
        root.eachChild(collectVehicles);

        var records = [];
        Ext.each(vehicles, function(veh) {
            var storageKey = 'sensor_dashboard_' + veh.vehid;
            var saved = localStorage.getItem(storageKey);
            var values = saved ? JSON.parse(saved) : {};
            var record = { vehicleName: veh.name, vehid: veh.vehid };
            Ext.each(me.sensors, function(sensor) {
                record[sensor.name] = values[sensor.name] === 'yes' ? 'yes' : 'no';
            });
            records.push(record);
        });

        store.loadData(records);
    },

    clearConfigForm: function () {
        var mainPanel = this.mainPanel;
        mainPanel.sensorsContainer.removeAll();
        mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
        this.updateLockIcon(false); // сброс
        // Не очищаем дашборд, он остаётся
    }
});
