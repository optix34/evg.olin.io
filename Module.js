/**
 * Extension for PILOT – Доп. Оборудование
 * Левая панель: плоский список ТС с поиском и фильтром по датчикам.
 * Правая панель: чекбоксы для выбранного ТС и дашборд статистики.
 * Стили соответствуют документации PILOT.
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
            items: [me.createVehicleList()]
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
            .vehicle-search-field, .vehicle-filter-field {
                margin: 5px;
                width: 100%;
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

    // Создание плоского списка ТС с поиском и фильтром по датчикам
    createVehicleList: function () {
        var me = this;
        var apiUrl = me.getApiUrl('ax/tree.php');

        // Хранилище для всех ТС (оригинальные данные)
        me.allVehicles = [];

        // Загружаем все ТС один раз
        Ext.Ajax.request({
            url: apiUrl,
            params: { vehs: 1, state: 1 },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                var vehicles = [];
                function traverse(nodes) {
                    Ext.each(nodes, function(node) {
                        if (node.vehid) {
                            vehicles.push({
                                vehid: node.vehid,
                                name: node.name
                            });
                        }
                        if (node.children && node.children.length) {
                            traverse(node.children);
                        }
                    });
                }
                traverse(data);
                me.allVehicles = vehicles;
                // Загружаем store после получения данных
                if (me.vehicleStore) {
                    me.applyFilters();
                }
            },
            scope: me
        });

        me.vehicleStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name'],
            data: []
        });

        // Поле поиска по названию
        var searchField = Ext.create('Ext.form.field.Text', {
            cls: 'vehicle-search-field',
            emptyText: 'Поиск ТС...',
            enableKeyEvents: true,
            triggers: {
                clear: {
                    cls: 'x-form-clear-trigger',
                    handler: function() {
                        searchField.reset();
                        me.searchText = '';
                        me.applyFilters();
                    }
                }
            },
            listeners: {
                keyup: function(field) {
                    me.searchText = field.getValue();
                    me.applyFilters();
                }
            }
        });

        // Выпадающий список с датчиками
        var filterCombo = Ext.create('Ext.form.field.ComboBox', {
            cls: 'vehicle-filter-field',
            emptyText: 'Фильтр по датчику...',
            queryMode: 'local',
            displayField: 'label',
            valueField: 'name',
            store: {
                fields: ['name', 'label'],
                data: [
                    { name: '', label: 'Все датчики' },
                    { name: 'aog', label: 'АОГ' },
                    { name: 'video', label: 'Видео' },
                    { name: 'tablo', label: 'Табло' },
                    { name: 'voice', label: 'Голос' },
                    { name: 'tf', label: 'ТФ' },
                    { name: 'kpp', label: 'КПП' },
                    { name: 'thg', label: 'ТХГ' },
                    { name: 'dut', label: 'ДУТ' },
                    { name: 'temp_sensor', label: 'Датчик t' }
                ]
            },
            value: '',
            listeners: {
                change: function(combo, newValue) {
                    me.selectedSensor = newValue;
                    me.applyFilters();
                }
            }
        });

        var grid = Ext.create('Ext.grid.Panel', {
            store: me.vehicleStore,
            columns: [{
                text: 'ТС',
                dataIndex: 'name',
                flex: 1
            }],
            tbar: [searchField, filterCombo],
            listeners: {
                selectionchange: function (selModel, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        var vehid = record.get('vehid');
                        var name = record.get('name');
                        me.loadConfigForVehicle(vehid, name);
                    } else {
                        me.clearConfigForm();
                    }
                }
            }
        });

        me.grid = grid;
        return grid;
    },

    // Применение фильтров (поиск + датчик)
    applyFilters: function() {
        var me = this;
        if (!me.allVehicles.length) return;

        var filtered = Ext.Array.clone(me.allVehicles);
        var searchText = me.searchText || '';
        var selectedSensor = me.selectedSensor || '';

        // Фильтр по поиску
        if (searchText) {
            filtered = Ext.Array.filter(filtered, function(vehicle) {
                return vehicle.name && vehicle.name.toLowerCase().indexOf(searchText.toLowerCase()) !== -1;
            });
        }

        // Фильтр по датчику
        if (selectedSensor && selectedSensor !== '') {
            filtered = Ext.Array.filter(filtered, function(vehicle) {
                var storageKey = 'sensor_dashboard_' + vehicle.vehid;
                var saved = localStorage.getItem(storageKey);
                var values = saved ? JSON.parse(saved) : {};
                return values[selectedSensor] === 'yes';
            });
        }

        me.vehicleStore.loadData(filtered);
        if (me.vehicleStore.getCount() > 0) {
            // Сбрасываем выделение, чтобы не было конфликтов
            me.grid.getSelectionModel().deselectAll();
        }
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

        // После сохранения обновляем фильтр (чтобы список ТС актуализировался)
        me.applyFilters();
        me.refreshDashboard();

        Ext.Msg.alert('Сохранено', 'Настройки сохранены');
    },

    refreshDashboard: function () {
        var me = this;
        var store = me.mainPanel.dashboardStore;
        if (!store) return;

        var allVehicles = me.allVehicles || [];
        var totalVehicleCount = allVehicles.length;

        var totals = {};
        Ext.each(me.sensors, function(s) { totals[s.name] = 0; });

        Ext.each(allVehicles, function(vehicle) {
            var storageKey = 'sensor_dashboard_' + vehicle.vehid;
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
        if (mainPanel && mainPanel.sensorsContainer) {
            mainPanel.sensorsContainer.removeAll();
            mainPanel.vehicleLabel.setText('ТС не выбрано');
        }
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
