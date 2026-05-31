/**
 * Extension for PILOT – Доп. Оборудование
 * Левое окно: плоский список транспортных средств (без папок), только колонка "ТС".
 * Правое окно: чекбоксы для выбранного ТС (АОГ, Видео, Табло и т.д.)
 * Нижняя часть: дашборд со статистикой по всем объектам.
 * Неактивные чекбоксы – полная видимость, чёрный текст, иконка замка.
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

        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'Доп. Оборудование',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [me.createVehicleGrid()]  // теперь грид, а не дерево
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;

        me.refreshDashboard();
    },

    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            .sensor-checkbox-item {
                display: inline-block;
                margin: 5px 15px 5px 0;
                white-space: nowrap;
            }
            .sensor-checkbox-item.locked .x-form-cb-label:after {
                content: " 🔒";
                font-size: 11px;
                opacity: 0.8;
                margin-left: 4px;
            }
            .sensors-hbox-container {
                background: #ffffff;
                padding: 12px 15px;
                border-bottom: 1px solid #e0e4e8;
            }
            .dashboard-panel {
                margin: 15px 10px;
                background: #ffffff;
                border: 1px solid #e0e4e8;
                border-radius: 4px;
            }
            .dashboard-grid .x-grid-header {
                background: #f5f5f5;
            }
            .x-form-cb-label {
                color: #000000 !important;
                font-weight: normal !important;
                opacity: 1 !important;
            }
            .x-form-checkbox {
                opacity: 1 !important;
            }
            .x-form-checkbox:disabled {
                opacity: 1 !important;
                background-color: #f0f0f0 !important;
                border-color: #a0a0a0 !important;
            }
            .x-form-field:disabled + .x-form-cb-label {
                opacity: 1 !important;
                color: #000000 !important;
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

    // Получение плоского списка всех ТС (без папок)
    loadFlatVehicles: function (callback) {
        var me = this;
        var apiUrl = me.getApiUrl('ax/tree.php');

        Ext.Ajax.request({
            url: apiUrl,
            params: { vehs: 1, state: 1 },
            success: function (response) {
                var data = Ext.decode(response.responseText);
                var vehicles = [];
                // Рекурсивный сбор всех узлов, у которых есть vehid
                function collect(nodes) {
                    Ext.each(nodes, function (node) {
                        if (node.vehid) {
                            vehicles.push({
                                vehid: node.vehid,
                                name: node.name,
                                model: node.model,
                                year: node.year,
                                ibutton: node.ibutton || node.ble_label || node.ble_tag || ''
                            });
                        }
                        if (node.children && node.children.length) {
                            collect(node.children);
                        }
                    });
                }
                collect(data);
                callback(vehicles);
            },
            failure: function () {
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список транспортных средств');
                callback([]);
            }
        });
    },

    // Создание грида с плоским списком ТС (без колонок "Год" и "Метка BLE")
    createVehicleGrid: function () {
        var me = this;

        var store = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name', 'model', 'year', 'ibutton'],
            data: []
        });

        var grid = Ext.create('Ext.grid.Panel', {
            store: store,
            columns: [{
                text: 'ТС',
                dataIndex: 'name',
                flex: 1
            }],
            viewConfig: {
                stripeRows: true,
                emptyText: 'Загрузка...'
            },
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

        // Загружаем данные
        me.loadFlatVehicles(function (vehicles) {
            store.loadData(vehicles);
        });

        return grid;
    },

    createMainPanel: function () {
        var me = this;

        var fieldContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsContainer',
            layout: {
                type: 'hbox',
                align: 'middle',
                pack: 'start',
                wrap: true
            },
            cls: 'sensors-hbox-container'
        });

        var dashboardStore = Ext.create('Ext.data.Store', {
            fields: ['sensor', 'totalVehicles', 'enabledCount', 'percentage'],
            data: []
        });

        var dashboardGrid = Ext.create('Ext.grid.Panel', {
            store: dashboardStore,
            cls: 'dashboard-grid',
            autoHeight: true,
            scrollable: false,
            columns: [{
                text: 'Датчик',
                dataIndex: 'sensor',
                flex: 2
            }, {
                text: 'Всего ТС',
                dataIndex: 'totalVehicles',
                flex: 1
            }, {
                text: 'Включено',
                dataIndex: 'enabledCount',
                flex: 1
            }, {
                text: '%',
                dataIndex: 'percentage',
                flex: 1,
                renderer: function(v) { return v + ' %'; }
            }],
            viewConfig: { stripeRows: true, emptyText: 'Нет данных' }
        });

        var dashboardPanel = Ext.create('Ext.panel.Panel', {
            title: 'Статистика по всем объектам',
            cls: 'dashboard-panel',
            layout: 'fit',
            items: [dashboardGrid],
            collapsible: true,
            collapsed: false,
            autoHeight: true
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { xtype: 'label', itemId: 'vehicleNameLabel', text: 'ТС не выбрано', style: 'font-weight: bold; font-size: 13px;' },
                '->',
                { text: 'Редактировать', handler: function () { me.setSensorsEditable(true); } },
                { text: 'Применить', handler: function () { me.saveCurrentConfig(); me.setSensorsEditable(false); me.refreshDashboard(); } }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            tbar: tbar,
            items: [
                fieldContainer,
                { xtype: 'component', height: 10 },
                dashboardPanel
            ]
        });

        mainPanel.sensorsContainer = fieldContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.dashboardStore = dashboardStore;
        mainPanel.dashboardGrid = dashboardGrid;

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
                labelCls: 'x-form-cb-label'
            });
            var wrapper = Ext.create('Ext.container.Container', {
                cls: 'sensor-checkbox-item',
                items: [checkbox],
                margin: '0 15 0 0'
            });
            container.add(wrapper);
            checkbox.wrapper = wrapper;
            if (checkbox.disabled) wrapper.addCls('locked');
        });

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
        me.refreshDashboard();
    },

    setSensorsEditable: function (editable) {
        var container = this.mainPanel.sensorsContainer;
        Ext.each(this.sensors, function (sensor) {
            var wrapper = container.down('#' + sensor.name)?.ownerCt;
            var checkbox = container.down('#' + sensor.name);
            if (checkbox) {
                checkbox.setDisabled(!editable);
                if (wrapper) {
                    if (editable) wrapper.removeCls('locked');
                    else wrapper.addCls('locked');
                }
            }
        });
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

    // Обновление дашборда на основе всех ТС (собираем из грида)
    refreshDashboard: function () {
        var me = this;
        var store = me.mainPanel.dashboardStore;
        if (!store) return;

        // Получаем все vehid из левого грида
        var grid = me.navTab.items.get(0);
        var allVehicles = [];
        if (grid && grid.getStore) {
            var gridStore = grid.getStore();
            gridStore.each(function (rec) {
                allVehicles.push(rec.get('vehid'));
            });
        }
        var totalVehicleCount = allVehicles.length;

        var totals = {};
        Ext.each(me.sensors, function(s) { totals[s.name] = 0; });

        Ext.each(allVehicles, function(vehid) {
            var storageKey = 'sensor_dashboard_' + vehid;
            var saved = localStorage.getItem(storageKey);
            var values = saved ? JSON.parse(saved) : {};
            Ext.each(me.sensors, function(s) {
                if (values[s.name] === 'yes') totals[s.name]++;
            });
        });

        var data = [];
        Ext.each(me.sensors, function(sensor) {
            var enabled = totals[sensor.name];
            var percent = totalVehicleCount ? Math.round((enabled / totalVehicleCount) * 100) : 0;
            data.push({
                sensor: sensor.label,
                totalVehicles: totalVehicleCount,
                enabledCount: enabled,
                percentage: percent
            });
        });
        store.loadData(data);
    },

    clearConfigForm: function () {
        var mainPanel = this.mainPanel;
        mainPanel.sensorsContainer.removeAll();
        mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
